import express from "express";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import {
  MetaError,
  graph,
  discoveryFields,
  usernameFrom,
  publicDiscovery,
} from "./meta.js";

import { configuredStore } from "./store.js";
import { loginAccounts } from "./login-accounts.js";
import { workspaceService } from "./workspace.js";
import { proRouter, cronHandler } from "./pro.js";
import { cameraRouter } from "./camera.js";

const app = express();
const store = configuredStore();
const appId = process.env.META_APP_ID;
const appSecret = process.env.META_APP_SECRET;
const loginConfigId = process.env.META_LOGIN_CONFIG_ID;
const publicUrl = process.env.APP_URL;
const missing = ["META_APP_ID", "META_APP_SECRET", "APP_URL"].filter(
  (k) => !process.env[k],
);
if (process.env.VERCEL && !store.shared) {
  missing.push("UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN");
}
const configured = missing.length === 0;
if (publicUrl && !/^https?:\/\//.test(publicUrl))
  throw new Error("APP_URL debe ser una URL HTTP o HTTPS.");
const callback = publicUrl
  ? `${publicUrl.replace(/\/$/, "")}/api/instagram/callback`
  : "";
const ttl = 8 * 3600000;
app.disable("x-powered-by");
app.use("/api", (_req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});
app.use(express.json({ limit: "750kb" }));
function cookie(req, name) {
  return (req.headers.cookie || "")
    .split(";")
    .map((x) => x.trim())
    .find((x) => x.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}
async function session(req) {
  const id = cookie(req, "pulso_session");
  const s = id ? await store.get(`session:${id}`) : null;
  return s && s.expires > Date.now() ? s : null;
}
async function requireSession(req) {
  const s = await session(req);
  if (!s)
    throw new MetaError(
      "Conecta tu cuenta profesional de Instagram para continuar.",
      401,
    );
  return s;
}
function requireCsrf(req, s) {
  const value = req.get("X-CSRF-Token") || "";
  if (
    Buffer.byteLength(value) !== Buffer.byteLength(s.csrf) ||
    !timingSafeEqual(Buffer.from(value), Buffer.from(s.csrf))
  )
    throw new MetaError(
      "La sesión cambió. Recarga la página y vuelve a intentarlo.",
      403,
    );
}
function requireConfig(_req, _res, next) {
  if (!configured)
    throw new MetaError(
      "Completa las variables de conexión indicadas en los ajustes del servidor antes de conectar Instagram.",
      503,
    );
  next();
}
app.get("/api/health", async (_req, res) => {
  // Confirm shared storage is reachable without returning data or credentials.
  if (store.shared) await store.get("health:connectivity");
  res.json({ ok: true, instagramConfigured: configured });
});
app.get("/api/instagram/status", async (req, res) => {
  const s = await session(req);
  res.json({
    configured,
    connected: Boolean(s),
    accounts: s?.accounts || [],
    selected: s?.selected || null,
    csrf: s?.csrf || null,
    sessionMode: store.shared ? "shared" : "memory",
    missing,
  });
});
app.get("/api/instagram/connect", requireConfig, async (req, res) => {
  const state = randomBytes(32).toString("hex");
  await store.put(`flow:${state}`, { expires: Date.now() + 600000 }, 600);
  res.cookie("pulso_oauth", state, {
    httpOnly: true,
    sameSite: "lax",
    secure: publicUrl.startsWith("https:"),
    maxAge: 600000,
    path: "/api/instagram",
  });
  const url = new URL("https://www.facebook.com/v23.0/dialog/oauth");
  Object.entries({
    client_id: appId,
    redirect_uri: callback,
    state,
    response_type: "code",
    auth_type: "rerequest",
    ...(loginConfigId
      ? { config_id: loginConfigId }
      : {
          scope:
            "instagram_basic,instagram_manage_insights,pages_show_list,pages_read_engagement",
        }),
  }).forEach(([key, value]) => url.searchParams.set(key, value));
  res.redirect(url.href);
});
app.get("/api/instagram/callback", requireConfig, async (req, res) => {
  const state = String(req.query.state || "");
  const flow = await store.take(`flow:${state}`);
  const expected = cookie(req, "pulso_oauth");
  res.clearCookie("pulso_oauth", { path: "/api/instagram" });
  if (!expected || expected !== state || !flow || flow.expires < Date.now())
    return res.redirect("/?connection=invalid-state");
  if (req.query.error || !req.query.code)
    return res.redirect("/?connection=cancelled");
  try {
    const initial = await graph("oauth/access_token", {
      client_id: appId,
      client_secret: appSecret,
      redirect_uri: callback,
      code: String(req.query.code),
    });
    const token = await graph("oauth/access_token", {
      grant_type: "fb_exchange_token",
      client_id: appId,
      client_secret: appSecret,
      fb_exchange_token: initial.access_token,
    });
    if (!token.access_token)
      throw new MetaError("Meta no devolvió una autorización válida.");
    const result = await loginAccounts(token.access_token, graph, {
      appAccessToken: `${appId}|${appSecret}`,
      expectedAppId: appId,
    });
    const { accounts } = result;
    if (!accounts.length) {
      // Counts and permission names only: never log tokens, account names or IDs.
      console.info("pulso_meta_account_discovery", JSON.stringify({
        issue: result.issue,
        pageCount: result.pageCount,
        listedPageCount: result.listedPageCount,
        grantedInstagramCount: result.grantedInstagramCount || 0,
        grantInspectionFailed: Boolean(result.grantInspectionFailed),
        grantError: result.grantError || null,
        failedInstagramLookups: result.failedInstagramLookups || 0,
        instagramLookupErrors: result.instagramLookupErrors || [],
        failedPageLookups: result.failedPageLookups || 0,
        missingPermissions: result.missingPermissions,
      }));
      return res.redirect(`/?connection=${result.issue}`);
    }
    const id = randomBytes(32).toString("hex");
    const sessionData = {
      token: token.access_token,
      accounts,
      selected: accounts[0].id,
      csrf: randomBytes(32).toString("hex"),
      expires: Date.now() + Math.min(ttl, (token.expires_in || 28800) * 1000),
    };
    await store.put(
      `session:${id}`,
      sessionData,
      Math.ceil((sessionData.expires - Date.now()) / 1000),
    );
    res.cookie("pulso_session", id, {
      httpOnly: true,
      sameSite: "lax",
      secure: publicUrl.startsWith("https:"),
      maxAge: ttl,
      path: "/",
    });
    res.redirect("/?connection=success");
  } catch {
    res.redirect("/?connection=failed");
  }
});
app.post("/api/instagram/select", async (req, res) => {
  const s = await requireSession(req);
  requireCsrf(req, s);
  if (!s.accounts.some((a) => a.id === req.body.id))
    throw new MetaError(
      "La cuenta seleccionada no pertenece a esta sesión.",
      400,
    );
  s.selected = req.body.id;
  await store.put(
    `session:${cookie(req, "pulso_session")}`,
    s,
    Math.ceil((s.expires - Date.now()) / 1000),
  );
  res.json({ selected: s.selected });
});
app.post("/api/instagram/disconnect", async (req, res) => {
  const s = await requireSession(req);
  requireCsrf(req, s);
  await store.delete(`tracking:${s.selected}`);
  await workspaceService(store).change(s.selected, d => { d.automation={...d.automation,enabled:false}; });
  await store.delete(`session:${cookie(req, "pulso_session")}`);
  res.clearCookie("pulso_session", { path: "/" });
  res.json({ ok: true });
});
app.post("/api/instagram/discover", async (req, res) => {
  const s = await requireSession(req);
  requireCsrf(req, s);
  const username = usernameFrom(req.body.username);
  if (!(await store.acquire(`sync:${cookie(req, "pulso_session")}`, 2)))
    throw new MetaError(
      "Espera un momento antes de volver a sincronizar.",
      429,
    );
  const data = await graph(s.selected, {
    access_token: s.token,
    fields: discoveryFields(username),
  });
  if (!data.business_discovery)
    throw new MetaError("No se encontró esa cuenta profesional pública.", 404);
  const safe = publicDiscovery(data.business_discovery);
  const workspace = await workspaceService(store).discover(s.selected, safe);
  res.json({ ...safe, workspace });
});
app.use("/api/camera", cameraRouter({store,publicUrl}));
app.use("/api/instagram/pro", proRouter({store,requireSession,requireCsrf}));
app.get("/api/cron/track", cronHandler({store}));
app.use(express.static(fileURLToPath(new URL("../dist", import.meta.url))));
app.use((req, res, next) => {
  if (req.path.startsWith("/api/"))
    return res.status(404).json({ error: "Ruta no encontrada." });
  if (req.method === "GET")
    return res.sendFile(
      fileURLToPath(new URL("../dist/index.html", import.meta.url)),
    );
  next();
});
app.use((err, _req, res, _next) => {
  const status =
    err instanceof MetaError
      ? err.status
      : err.type === "entity.parse.failed"
        ? 400
        : 500;
  res.status(status).json({
    error:
      err instanceof MetaError
        ? err.message
        : status === 400
          ? "Solicitud no válida."
          : "No se pudo completar la operación.",
  });
});
export default app;

const direct =
  process.argv[1] &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (direct && !process.env.VERCEL) {
  app.listen(Number(process.env.PORT || 3001), "0.0.0.0", () =>
    console.log(
      `Pulso API listening on port ${process.env.PORT || 3001}; Instagram ${configured ? "configured" : "needs configuration"}`,
    ),
  );
}
