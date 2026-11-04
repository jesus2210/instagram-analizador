import test from "node:test";
import assert from "node:assert/strict";
import {
  createMemoryStore,
  createRedisStore,
  configuredStore,
} from "../server/store.js";

test("memory storage consumes OAuth state exactly once under concurrent callbacks", async () => {
  const store = createMemoryStore();
  await store.put("flow:test", { expires: Date.now() + 1000 }, 10);
  const consumed = await Promise.all([
    store.take("flow:test"),
    store.take("flow:test"),
  ]);
  assert.equal(consumed.filter(Boolean).length, 1);
  await store.put("expired", "no", -1);
  assert.equal(await store.get("expired"), null);
  assert.equal(await store.acquire("sync:test", 2), true);
  assert.equal(await store.acquire("sync:test", 2), false);
});

function fakeRedis() {
  const values = new Map();
  return async (url, options) => {
    assert.equal(url.protocol, "https:");
    assert.equal(options.headers.Authorization, "Bearer synthetic-token");
    const [op, key, value, ...args] = JSON.parse(options.body);
    let result = null;
    if (op === "SET") {
      assert.ok(args.includes("EX"));
      if (!(args.includes("NX") && values.has(key))) {
        values.set(key, value);
        result = "OK";
      }
    } else if (op === "GET") result = values.get(key) ?? null;
    else if (op === "GETDEL") {
      result = values.get(key) ?? null;
      values.delete(key);
    } else if (op === "DEL") {
      result = Number(values.delete(key));
    }
    return { ok: true, json: async () => ({ result }) };
  };
}

test("separate server instances share sessions, one-use OAuth state and sync throttling", async () => {
  const fetcher = fakeRedis();
  const config = {
    url: "https://example.upstash.io",
    token: "synthetic-token",
    namespace: "https://pulso.example.test",
    fetcher,
  };
  const instanceA = createRedisStore(config);
  const instanceB = createRedisStore(config);
  await instanceA.put(
    "session:test",
    { selected: "account-1", csrf: "test-csrf" },
    300,
  );
  assert.deepEqual(await instanceB.get("session:test"), {
    selected: "account-1",
    csrf: "test-csrf",
  });
  await instanceB.put("session:test", { selected: "account-2" }, 250);
  assert.equal((await instanceA.get("session:test")).selected, "account-2");
  await instanceA.put("flow:test", { expires: 123 }, 600);
  assert.deepEqual(await instanceB.take("flow:test"), { expires: 123 });
  assert.equal(await instanceA.take("flow:test"), null);
  assert.equal(await instanceA.acquire("sync:test", 2), true);
  assert.equal(await instanceB.acquire("sync:test", 2), false);
  await instanceB.delete("session:test");
  assert.equal(await instanceA.get("session:test"), null);
  const otherProject = createRedisStore({
    ...config,
    namespace: "https://other.example.test",
  });
  assert.equal(await otherProject.get("sync:test"), null);
});

test("Redis failures are reported without leaking provider responses or tokens", async () => {
  const store = createRedisStore({
    url: "https://example.upstash.io",
    token: "synthetic-private-value",
    fetcher: async () => ({
      ok: false,
      json: async () => ({ error: "synthetic-private-value" }),
    }),
  });
  await assert.rejects(
    store.get("session:test"),
    (error) =>
      error.status === 503 &&
      !error.message.includes("synthetic-private-value"),
  );
  assert.throws(
    () => createRedisStore({ url: "http://example.upstash.io", token: "test" }),
    /HTTPS/,
  );
});

test("Vercel Marketplace and Upstash environment bindings select shared storage", () => {
  assert.equal(configuredStore({}).shared, false);
  assert.equal(
    configuredStore({
      UPSTASH_REDIS_REST_URL: "https://example.upstash.io",
      UPSTASH_REDIS_REST_TOKEN: "test",
    }).shared,
    true,
  );
  assert.equal(
    configuredStore({
      KV_REST_API_URL: "https://example.upstash.io",
      KV_REST_API_TOKEN: "test",
    }).shared,
    true,
  );
});
