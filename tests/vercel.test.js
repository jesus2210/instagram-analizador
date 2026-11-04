import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { setTimeout } from "node:timers/promises";
import { readFile } from "node:fs/promises";

test("Vercel exports an HTTP handler and blocks OAuth without shared storage", async (t) => {
  const env = {
    ...process.env,
    VERCEL: "1",
    META_APP_ID: "synthetic-app",
    META_APP_SECRET: "synthetic-not-a-secret",
    APP_URL: "https://pulso.example.test",
  };
  for (const name of [
    "UPSTASH_REDIS_REST_URL",
    "UPSTASH_REDIS_REST_TOKEN",
    "KV_REST_API_URL",
    "KV_REST_API_TOKEN",
  ])
    delete env[name];
  const child = spawn(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `
    import { createServer } from 'node:http';
    import handler from './api/index.js';
    createServer(handler).listen(3123, '127.0.0.1', () => console.log('ready'));
  `,
    ],
    { env, stdio: ["ignore", "pipe", "pipe"] },
  );
  t.after(() => child.kill());
  let ready = false;
  child.stdout.on("data", (data) => {
    if (String(data).includes("ready")) ready = true;
  });
  for (let i = 0; i < 100 && !ready; i++) {
    if (child.exitCode !== null)
      throw new Error("Exported handler failed to load");
    await setTimeout(50);
  }
  assert.equal(ready, true);
  const status = await (
    await fetch("http://127.0.0.1:3123/api/instagram/status")
  ).json();
  assert.equal(status.configured, false);
  assert.deepEqual(status.missing, [
    "UPSTASH_REDIS_REST_URL",
    "UPSTASH_REDIS_REST_TOKEN",
  ]);
  const oauth = await fetch("http://127.0.0.1:3123/api/instagram/connect", {
    redirect: "manual",
  });
  assert.equal(oauth.status, 503);
  assert.equal((await fetch("http://127.0.0.1:3123/api/health")).status, 200);
  const config = JSON.parse(await readFile("vercel.json", "utf8"));
  assert.equal(config.outputDirectory, "dist");
  assert.equal(config.rewrites[0].source, "/api/:path*");
});
