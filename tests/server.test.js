import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { setTimeout } from "node:timers/promises";

async function start(port, config = {}) {
  const env = { ...process.env, PORT: String(port), ...config };
  for (const key of [
    "META_APP_ID",
    "META_APP_SECRET",
    "META_LOGIN_CONFIG_ID",
    "APP_URL",
  ])
    if (!(key in config)) delete env[key];
  const child = spawn(process.execPath, ["server/index.js"], {
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let ready = false;
  child.stdout.on("data", (data) => {
    if (String(data).includes("Pulso API listening")) ready = true;
  });
  for (let i = 0; i < 80 && !ready; i++) {
    if (child.exitCode !== null) throw new Error("API did not start");
    await setTimeout(50);
  }
  if (!ready) {
    child.kill();
    throw new Error("API readiness timed out");
  }
  return child;
}

test("unconfigured server is healthy but refuses Instagram operations", async (t) => {
  const child = await start(3121);
  t.after(() => child.kill());
  const health = await (await fetch("http://127.0.0.1:3121/api/health")).json();
  assert.deepEqual(health, { ok: true, instagramConfigured: false });
  const statusResponse = await fetch(
    "http://127.0.0.1:3121/api/instagram/status",
  );
  assert.equal(statusResponse.headers.get("cache-control"), "no-store");
  const status = await statusResponse.json();
  assert.equal(status.connected, false);
  assert.deepEqual(status.missing, [
    "META_APP_ID",
    "META_APP_SECRET",
    "APP_URL",
  ]);
  const connect = await fetch("http://127.0.0.1:3121/api/instagram/connect", {
    redirect: "manual",
  });
  assert.equal(connect.status, 503);
  const discovery = await fetch(
    "http://127.0.0.1:3121/api/instagram/discover",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "test" }),
    },
  );
  assert.equal(discovery.status, 401);
  const invalidJson = await fetch(
    "http://127.0.0.1:3121/api/instagram/discover",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{",
    },
  );
  assert.equal(invalidJson.status, 400);
  const missing = await fetch("http://127.0.0.1:3121/api/no-route");
  assert.equal(missing.status, 404);
});
test("OAuth creates a secure state and rejects forged callbacks without contacting Meta", async (t) => {
  const child = await start(3122, {
    META_APP_ID: "synthetic-app-id",
    META_APP_SECRET: "synthetic-not-a-secret",
    APP_URL: "https://app.example.test",
  });
  t.after(() => child.kill());
  const connect = await fetch("http://127.0.0.1:3122/api/instagram/connect", {
    redirect: "manual",
  });
  assert.equal(connect.status, 302);
  const location = new URL(connect.headers.get("location"));
  assert.equal(location.origin, "https://www.facebook.com");
  assert.equal(
    location.searchParams.get("redirect_uri"),
    "https://app.example.test/api/instagram/callback",
  );
  assert.equal(location.searchParams.get("state").length, 64);
  assert.ok(
    location.searchParams.get("scope").includes("instagram_manage_insights"),
  );
  const cookie = connect.headers.get("set-cookie");
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /Secure/);
  assert.match(cookie, /SameSite=Lax/);
  assert.ok(!location.href.includes("synthetic-not-a-secret"));
  const forged = await fetch(
    "http://127.0.0.1:3122/api/instagram/callback?state=forged&code=unused",
    { redirect: "manual" },
  );
  assert.equal(forged.headers.get("location"), "/?connection=invalid-state");
  const status = await (
    await fetch("http://127.0.0.1:3122/api/instagram/status")
  ).json();
  assert.equal(status.configured, true);
  assert.equal(status.connected, false);
  assert.ok(!JSON.stringify(status).includes("synthetic-not-a-secret"));
});

test("Facebook Login for Business uses the selected configuration without mixing permission scopes", async (t) => {
  const child = await start(3124, {
    META_APP_ID: "synthetic-app-id",
    META_APP_SECRET: "synthetic-not-a-secret",
    META_LOGIN_CONFIG_ID: "synthetic-user-login-config",
    APP_URL: "https://app.example.test",
  });
  t.after(() => child.kill());
  const response = await fetch("http://127.0.0.1:3124/api/instagram/connect", {
    redirect: "manual",
  });
  assert.equal(response.status, 302);
  const url = new URL(response.headers.get("location"));
  assert.equal(
    url.searchParams.get("config_id"),
    "synthetic-user-login-config",
  );
  assert.equal(url.searchParams.get("response_type"), "code");
  assert.equal(url.searchParams.has("scope"), false);
  assert.equal(
    url.searchParams.get("redirect_uri"),
    "https://app.example.test/api/instagram/callback",
  );
  assert.equal(url.searchParams.get("state").length, 64);
});
