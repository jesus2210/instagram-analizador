import express from "express";
import multer from "multer";
import { timingSafeEqual, randomBytes } from "node:crypto";
import {
  MetaError,
  graph,
  discoveryFields,
  publicDiscovery,
  usernameFrom,
} from "./meta.js";
import {
  workspaceService,
  freshWorkspace,
  RETENTION,
  text,
  applyDiscoveries,
} from "./workspace.js";
import { normalizeDiscovery } from "../src/model.js";
import { createBrief, analyzeTranscript, transcribe, AI_MODEL } from "./ai.js";
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 3 * 1024 * 1024, files: 1, fields: 4, fieldSize: 200000 },
}).single("audio");
const JOB_TTL = 60 * 86400;
export function proRouter({
  store,
  requireSession,
  requireCsrf,
  request = graph,
}) {
  const router = express.Router();
  const workspaces = workspaceService(store);
  router.use(async (req, res, next) => {
    try {
      req.ownerSession = await requireSession(req);
      if (req.method !== "GET") requireCsrf(req, req.ownerSession);
      next();
    } catch (e) {
      next(e);
    }
  });
  router.get("/workspace", async (req, res) =>
    res.json(await workspaces.read(req.ownerSession.selected)),
  );
  router.post("/workspace", async (req, res) =>
    res.json(await workspaces.update(req.ownerSession.selected, req.body)),
  );
  router.post("/import", async (req, res) => {
    if (
      !Array.isArray(req.body.usernames) ||
      !req.body.usernames.length ||
      req.body.usernames.length > 3
    )
      throw new MetaError(
        "Importa entre una y tres cuentas por solicitud.",
        400,
      );
    const names = [...new Set(req.body.usernames.map(usernameFrom))],
      s = req.ownerSession;
    const lock = `import:${s.selected}`;
    if (!(await store.acquire(lock, 55)))
      throw new MetaError(
        "Ya hay una importación en curso. Espera a que termine.",
        409,
      );
    try {
      const results = await Promise.allSettled(
        names.map((username) =>
          request(s.selected, {
            access_token: s.token,
            fields: discoveryFields(username),
          }),
        ),
      );
      const failed = [];
      for (let i = 0; i < results.length; i++) {
        const row = results[i];
        if (row.status === "fulfilled" && row.value.business_discovery)
          await workspaces.discover(
            s.selected,
            publicDiscovery(row.value.business_discovery),
          );
        else failed.push(names[i]);
      }
      res.json({ workspace: await workspaces.read(s.selected), failed });
    } finally {
      await store.delete(lock);
    }
  });
  router.post("/remove", async (req, res) => {
    if (
      !Number.isInteger(req.body?.revision) ||
      typeof req.body?.id !== "string"
    )
      throw new MetaError(
        "Recarga los datos antes de eliminar una cuenta.",
        400,
      );
    const data = await workspaces.change(
      req.ownerSession.selected,
      (d) => {
        d.accounts = d.accounts.filter((a) => a.id !== req.body.id);
        d.posts = d.posts.filter((p) => p.accountId !== req.body.id);
        d.history = d.history.filter((h) => h.accountId !== req.body.id);
      },
      req.body.revision,
    );
    res.json(data);
  });
  router.post("/reset", async (req, res) => {
    if (!Number.isInteger(req.body?.revision))
      throw new MetaError("Recarga los datos antes de vaciar el espacio.", 400);
    const data = await workspaces.change(
      req.ownerSession.selected,
      (d) => Object.assign(d, freshWorkspace(), { revision: d.revision }),
      req.body.revision,
    );
    await store.delete(`tracking:${req.ownerSession.selected}`);
    res.json(data);
  });
  router.get("/capabilities", async (req, res) => {
    const day = new Date().toISOString().slice(0, 10);
    const usage =
      (await store.get(`ai-usage:${req.ownerSession.selected}:${day}`)) || 0;
    res.json({
      ai: Boolean(process.env.OPENAI_API_KEY),
      model: AI_MODEL,
      persistence: store.shared,
      automation: store.shared && Boolean(process.env.CRON_SECRET),
      dailyLimit: 5,
      usedToday: usage,
      retentionDays: 180,
    });
  });
  async function budget(owner) {
    if (!process.env.OPENAI_API_KEY)
      throw new MetaError(
        "La IA está preparada. Falta configurar OPENAI_API_KEY en Vercel para activarla.",
        503,
      );
    const key = `ai-usage:${owner}:${new Date().toISOString().slice(0, 10)}`;
    const lock = key + ":lock";
    if (!(await store.acquire(lock, 65)))
      throw new MetaError(
        "Ya hay un análisis de IA en curso. Espera a que termine.",
        429,
      );
    try {
      const used = (await store.get(key)) || 0;
      if (used >= 5)
        throw new MetaError(
          "Has alcanzado los 5 análisis diarios de este espacio. Vuelve mañana (UTC).",
          429,
        );
      await store.put(key, used + 1, 2 * 86400);
    } catch (e) {
      await store.delete(lock);
      throw e;
    }
    return async () => store.delete(lock);
  }
  router.post("/brief", async (req, res) => {
    const s = req.ownerSession,
      data = await workspaces.read(s.selected);
    if (data.posts.length < 5)
      throw new MetaError(
        "Sincroniza suficientes publicaciones reales antes de generar un guion.",
        400,
      );
    const release = await budget(s.selected);
    try {
      const brief = {
        id: randomBytes(12).toString("hex"),
        ...(await createBrief(data)),
      };
      await workspaces.change(s.selected, (d) => {
        d.briefs = [brief, ...d.briefs].slice(0, 20);
      });
      res.json(brief);
    } finally {
      await release();
    }
  });
  router.post(
    "/video",
    (req, res, next) =>
      upload(req, res, (e) => {
        if (e)
          return next(
            new MetaError(
              "El audio supera 3 MB o el archivo no es válido.",
              413,
            ),
          );
        next();
      }),
    async (req, res) => {
      let frames = [];
      try {
        frames = JSON.parse(req.body.frames || "[]");
      } catch {
        throw new MetaError("Los fotogramas no son válidos.", 400);
      }
      if (
        !Array.isArray(frames) ||
        frames.length > 3 ||
        frames.some(
          (f) =>
            typeof f !== "string" ||
            !/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(f) ||
            f.length > 60000,
        )
      )
        throw new MetaError("Adjunta hasta tres fotogramas JPEG válidos.", 400);
      if (req.file && !validAudio(req.file))
        throw new MetaError(
          "El archivo debe contener audio WebM, MP4, MP3 o WAV.",
          400,
        );
      if (
        !req.file &&
        (!req.body.transcript ||
          req.body.transcript.length < 30 ||
          req.body.transcript.length > 18000)
      )
        throw new MetaError(
          "Añade audio o una transcripción de 30 a 18.000 caracteres.",
          400,
        );
      const release = await budget(req.ownerSession.selected);
      try {
        const transcript = req.file
          ? await transcribe(req.file)
          : req.body.transcript;
        const analysis = {
          id: randomBytes(12).toString("hex"),
          title: text(req.body.title, 160) || "Análisis de vídeo",
          ...(await analyzeTranscript(transcript, frames)),
        };
        await workspaces.change(req.ownerSession.selected, (d) => {
          d.videoAnalyses = [analysis, ...d.videoAnalyses].slice(0, 10);
        });
        res.json(analysis);
      } finally {
        await release();
      }
    },
  );
  router.post("/own", async (req, res) => {
    const s = req.ownerSession;
    if (!(await store.acquire(`own-sync:${s.selected}`, 30)))
      throw new MetaError("Espera antes de actualizar tus estadísticas.", 429);
    const profile = await request(s.selected, {
      access_token: s.token,
      fields:
        "id,username,name,followers_count,media_count,media.limit(50){id,caption,media_type,media_product_type,permalink,timestamp,like_count,comments_count}",
    });
    const normalized = normalizeDiscovery(publicDiscovery(profile));
    // Metric availability varies by account and API version. A denied metric is never a zero.
    const metricNames = ["reach", "accounts_engaged"];
    const linked = (await workspaces.read(s.selected)).savedIdeas
      .map((i) => i.publishedPostId)
      .filter(Boolean);
    const mediaIds = [
      ...new Set([...linked, ...normalized.posts.slice(0, 6).map((p) => p.id)]),
    ]
      .filter((id) => normalized.posts.some((p) => p.id === id))
      .slice(0, 8);
    const [settled, mediaResults] = await Promise.all([
      Promise.allSettled(
        metricNames.map((metric) =>
          request(`${s.selected}/insights`, {
            access_token: s.token,
            metric,
            period: "day",
            metric_type: "total_value",
            since: Math.floor(Date.now() / 1000) - 7 * 86400,
            until: Math.floor(Date.now() / 1000),
          }),
        ),
      ),
      Promise.allSettled(
        mediaIds.map((id) =>
          request(`${id}/insights`, {
            access_token: s.token,
            metric: "views,saved,shares,total_interactions",
          }),
        ),
      ),
    ]);
    const perPostInsights = mediaIds.map((postId, i) => ({
      postId,
      metrics: ["views", "saved", "shares", "total_interactions"].map(
        (name) => {
          const row =
            mediaResults[i].status === "fulfilled"
              ? mediaResults[i].value.data?.find((x) => x.name === name)
              : null;
          const value =
            row?.values?.[0]?.value ?? row?.total_value?.value ?? null;
          return {
            name,
            value: Number.isFinite(value) ? value : null,
            available: Number.isFinite(value),
          };
        },
      ),
    }));
    const metrics = metricNames.map((name, i) => ({
      name,
      value:
        settled[i].status === "fulfilled"
          ? (settled[i].value.data?.[0]?.total_value?.value ?? null)
          : null,
      available:
        settled[i].status === "fulfilled" &&
        Number.isFinite(settled[i].value.data?.[0]?.total_value?.value),
    }));
    const own = {
      ...normalized,
      metrics,
      perPostInsights,
      periodDays: 7,
      updatedAt: new Date().toISOString(),
    };
    await workspaces.change(s.selected, (d) => {
      d.own = own;
    });
    res.json(own);
  });
  router.post("/automation", async (req, res) => {
    const s = req.ownerSession;
    if (typeof req.body.enabled !== "boolean")
      throw new MetaError("Indica si quieres activar el seguimiento.", 400);
    if (req.body.enabled && (!store.shared || !process.env.CRON_SECRET))
      throw new MetaError(
        "El seguimiento diario necesita almacenamiento compartido y CRON_SECRET en Vercel.",
        503,
      );
    if (req.body.enabled) {
      // Verify token expiry before saving a separate, renewable background authorization.
      const info = await request("debug_token", {
        input_token: s.token,
        access_token: `${process.env.META_APP_ID}|${process.env.META_APP_SECRET}`,
      });
      if (
        !info.data?.is_valid ||
        String(info.data.app_id) !== String(process.env.META_APP_ID)
      )
        throw new MetaError(
          "Vuelve a conectar Instagram para renovar el seguimiento.",
          401,
        );
      const expires =
        (info.data.expires_at || Math.floor(Date.now() / 1000) + JOB_TTL) *
        1000;
      const accessExpires = info.data.data_access_expires_at
        ? info.data.data_access_expires_at * 1000
        : expires;
      const effective = Math.min(expires, accessExpires);
      if (effective < Date.now() + 86400000)
        throw new MetaError(
          "Tu autorización caduca pronto. Vuelve a conectar antes de activar el seguimiento.",
          401,
        );
      const lock = "tracking:registry-lock";
      if (!(await store.acquire(lock, 55)))
        throw new MetaError(
          "El seguimiento se está actualizando. Prueba de nuevo.",
          409,
        );
      try {
        const owners = (await store.get("tracking:owners")) || [];
        if (!owners.includes(s.selected) && owners.length >= 20)
          throw new MetaError(
            "El seguimiento automático ha alcanzado la capacidad de esta instalación.",
            503,
          );
        await store.put(
          `tracking:${s.selected}`,
          {
            token: s.token,
            expires: effective,
            cursor: 0,
            jobId: randomBytes(16).toString("hex"),
          },
          Math.min(JOB_TTL, Math.floor((effective - Date.now()) / 1000)),
        );
        await store.put(
          "tracking:owners",
          [...new Set([...owners, s.selected])],
          RETENTION,
        );
      } finally {
        await store.delete(lock);
      }
    } else await store.delete(`tracking:${s.selected}`);
    res.json(
      await workspaces.change(s.selected, (d) => {
        d.automation = {
          enabled: req.body.enabled,
          updatedAt: new Date().toISOString(),
        };
      }),
    );
  });
  return router;
}
export function validAudio(file) {
  const b = file.buffer;
  return (
    b?.length >= 12 &&
    (b.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3])) ||
      b.toString("ascii", 4, 8) === "ftyp" ||
      b.toString("ascii", 0, 3) === "ID3" ||
      (b[0] === 255 && (b[1] & 224) === 224) ||
      (b.toString("ascii", 0, 4) === "RIFF" &&
        b.toString("ascii", 8, 12) === "WAVE"))
  );
}
export function cronHandler({ store, request = graph }) {
  return async (req, res) => {
    const expected = process.env.CRON_SECRET;
    const provided = req.get("authorization") || "";
    const want = `Bearer ${expected || ""}`;
    if (
      !expected ||
      Buffer.byteLength(provided) !== Buffer.byteLength(want) ||
      !timingSafeEqual(Buffer.from(provided), Buffer.from(want))
    )
      throw new MetaError("No autorizado.", 401);
    if (!store.shared)
      throw new MetaError(
        "El seguimiento necesita almacenamiento compartido.",
        503,
      );
    if (!(await store.acquire("tracking:run-lock", 65)))
      return res.json({ skipped: true });
    const started = Date.now(),
      ws = workspaceService(store);
    let synced = 0,
      failed = 0;
    try {
      const owners = (await store.get("tracking:owners")) || [];
      const position = (await store.get("tracking:position")) || 0;
      for (let j = 0; j < owners.length && Date.now() - started < 25000; j++) {
        const index = (position + j) % owners.length,
          owner = owners[index];
        const tracking = await store.get(`tracking:${owner}`);
        await store.put(
          "tracking:position",
          (index + 1) % owners.length,
          RETENTION,
        );
        if (!tracking || tracking.expires < Date.now()) {
          await ws.change(owner, (d) => {
            if (d.automation.enabled)
              d.automation = {
                ...d.automation,
                enabled: false,
                lastError:
                  "La autorización caducó. Vuelve a conectar y activa el seguimiento.",
              };
          });
          continue;
        }
        const data = await ws.read(owner);
        if (!data.automation.enabled || !data.accounts.length) continue;
        const batch = Array.from(
          { length: Math.min(20, data.accounts.length) },
          (_, k) =>
            data.accounts[((tracking.cursor || 0) + k) % data.accounts.length],
        );
        // Fetch in parallel, write sequentially to avoid overwriting snapshots.
        const results = await Promise.allSettled(
          batch.map((a) =>
            request(owner, {
              access_token: tracking.token,
              fields: discoveryFields(a.username),
            }),
          ),
        );
        let ownerFailed = 0;
        const successful = [];
        for (const result of results) {
          if (result.status === "fulfilled" && result.value.business_discovery)
            successful.push(publicDiscovery(result.value.business_discovery));
          else {
            failed++;
            ownerFailed++;
          }
        }
        const revoked = results.some(
          (r) => r.status === "rejected" && r.reason?.status === 401,
        );
        let applied = false;
        await ws.change(owner, async (d) => {
          const current = await store.get(`tracking:${owner}`);
          // Respect disable/reset/reconnection even if it happened during the Meta request.
          if (
            !d.automation.enabled ||
            !current ||
            current.jobId !== tracking.jobId
          )
            return;
          if (revoked) {
            await store.delete(`tracking:${owner}`);
            d.automation = {
              ...d.automation,
              enabled: false,
              lastRun: new Date().toISOString(),
              lastError:
                "Meta revocó o caducó la autorización. Vuelve a conectar Instagram.",
            };
            return;
          }
          applyDiscoveries(d, successful);
          tracking.cursor =
            ((tracking.cursor || 0) + batch.length) % data.accounts.length;
          await store.put(
            `tracking:${owner}`,
            tracking,
            Math.min(
              JOB_TTL,
              Math.max(1, Math.floor((tracking.expires - Date.now()) / 1000)),
            ),
          );
          d.automation = {
            ...d.automation,
            lastRun: new Date().toISOString(),
            lastBatch: batch.length,
            lastError: ownerFailed
              ? "Meta no permitió actualizar alguna cuenta. Prueba una sincronización manual."
              : null,
          };
          applied = true;
        });
        if (applied) synced += successful.length;
      }
      res.json({ synced, failed });
    } finally {
      await store.delete("tracking:run-lock");
    }
  };
}
