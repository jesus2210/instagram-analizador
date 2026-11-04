import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { createMemoryStore } from "../server/store.js";
import { workspaceService } from "../server/workspace.js";
import { proRouter, cronHandler, validAudio } from "../server/pro.js";
import { MetaError } from "../server/meta.js";
import { createBrief, analyzeTranscript } from "../server/ai.js";
const raw = (id = "a") => ({
  id,
  username: "nutrition",
  followers_count: 100,
  media: {
    data: [
      {
        id: "p",
        timestamp: "2026-10-20",
        like_count: 10,
        comments_count: 2,
        caption: "Receta",
      },
    ],
  },
});
async function serve(t, store = createMemoryStore(), request) {
  const app = express();
  app.use(express.json());
  app.use(
    "/pro",
    proRouter({
      store,
      requireSession: async (req) => {
        if (!req.get("x-owner")) throw new MetaError("Conecta Instagram", 401);
        return {
          selected: req.get("x-owner"),
          token: "test-private-token",
          csrf: "test-csrf",
        };
      },
      requireCsrf: (req) => {
        if (req.get("x-csrf-token") !== "test-csrf")
          throw new MetaError("CSRF", 403);
      },
      request,
    }),
  );
  app.get("/cron", cronHandler({ store, request }));
  app.use((err, req, res, next) =>
    res.status(err.status || 500).json({ error: err.message }),
  );
  const server = await new Promise((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });
  t.after(() => new Promise((r) => server.close(r)));
  const base = `http://127.0.0.1:${server.address().port}`;
  return (path, method = "GET", body, owner = "one", csrf = "test-csrf") =>
    fetch(base + path, {
      method,
      headers: {
        "x-owner": owner,
        "x-csrf-token": csrf,
        "content-type": "application/json",
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
}
test("cloud workspaces isolate verified owners, reject stale writes and preserve snapshots across updates", async () => {
  const store = createMemoryStore(),
    ws = workspaceService(store);
  await ws.discover("one", raw());
  assert.equal((await ws.read("two")).accounts.length, 0);
  let one = await ws.read("one");
  await ws.update("one", {
    revision: one.revision,
    profile: { audience: "Gente ocupada" },
  });
  await assert.rejects(
    ws.update("one", { revision: one.revision, savedIdeas: [] }),
    (e) => e.status === 409,
  );
  await ws.discover("one", raw());
  one = await ws.read("one");
  assert.equal(one.history.length, 1);
  assert.equal(one.profile.audience, "Gente ocupada");
  assert.ok(!JSON.stringify(one).includes("token"));
});
test("pro endpoints require a session and CSRF and cannot read another account", async (t) => {
  const fetcher = await serve(t);
  assert.equal((await fetcher("/pro/workspace", "GET", null, "")).status, 401);
  assert.equal(
    (await fetcher("/pro/workspace", "POST", { revision: 0 }, "one", "bad"))
      .status,
    403,
  );
  const saved = await fetcher("/pro/workspace", "POST", {
    revision: 0,
    savedIdeas: [{ id: "idea", title: "Test" }],
  });
  assert.equal(saved.status, 200);
  assert.equal(
    (await (await fetcher("/pro/workspace", "GET", null, "two")).json())
      .savedIdeas.length,
    0,
  );
  assert.equal(
    (await fetcher("/pro/workspace", "POST", { revision: 0 })).status,
    409,
  );
});
test("owned insights keep inaccessible metrics unknown instead of reporting zero", async (t) => {
  const fetcher = await serve(t, createMemoryStore(), async (path, params) => {
    if (path.endsWith("/insights")) throw new MetaError("Denied", 403);
    return raw("one");
  });
  const response = await fetcher("/pro/own", "POST", {});
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.account.id, "one");
  assert.ok(
    body.metrics.every((m) => m.value === null && m.available === false),
  );
  assert.ok(!JSON.stringify(body).includes("test-private-token"));
});
test("reset removes histories, AI material and background authorization together", async (t) => {
  const store = createMemoryStore(),
    ws = workspaceService(store);
  await ws.discover("one", raw());
  await store.put("tracking:one", { token: "private" }, 100);
  await ws.change("one", (d) => {
    d.briefs = [{ title: "old" }];
    d.automation.enabled = true;
  });
  const fetcher = await serve(t, store);
  const result = await fetcher("/pro/reset", "POST", { revision: 2 });
  assert.equal(result.status, 200);
  const data = await result.json();
  assert.equal(data.history.length, 0);
  assert.equal(data.briefs.length, 0);
  assert.equal(data.automation.enabled, false);
  assert.equal(await store.get("tracking:one"), null);
});
test("cron refuses unauthenticated calls and disabled automation cannot save a token", async (t) => {
  const fetcher = await serve(t);
  assert.equal((await fetcher("/cron")).status, 401);
  assert.equal(
    (await fetcher("/pro/automation", "POST", { enabled: true })).status,
    503,
  );
});
test("AI validates references and never leaks raw provider errors or credentials", async () => {
  const date = new Date(Date.now() - 5 * 86400000).toISOString();
  const posts = Array.from({ length: 6 }, (_, i) => ({
    id: String(i),
    accountId: "a",
    format: "reel",
    date,
    caption: "Receta",
    topic: "Recetas",
    likes: 10 + i,
    comments: 1,
  }));
  const valid = {
    title: "Receta práctica",
    hook: "Prueba esto",
    script: "Guion",
    shots: ["Plano"],
    cta: "Comparte",
    reason: "Patrón observado",
    sourceIds: ["0"],
    healthChecks: [],
    hypothesis: "Probar claridad",
  };
  const options = {
    key: "fake-test-key",
    fetcher: async (url, req) => {
      assert.ok(url.startsWith("https://api.openai.com/"));
      const body = JSON.parse(req.body);
      assert.ok(body.messages[0].content.includes("NO fiable"));
      return {
        ok: true,
        json: async () => ({
          choices: [{ message: { content: JSON.stringify(valid) } }],
        }),
      };
    },
  };
  assert.equal(
    (await createBrief({ posts, profile: {}, savedIdeas: [] }, options))
      .sourceIds[0],
    "0",
  );
  await assert.rejects(
    createBrief(
      { posts, profile: {}, savedIdeas: [] },
      {
        ...options,
        fetcher: async () => ({
          ok: true,
          json: async () => ({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    ...valid,
                    sourceIds: ["invented"],
                  }),
                },
              },
            ],
          }),
        }),
      },
    ),
    /referencias válidas/,
  );
  await assert.rejects(
    analyzeTranscript(
      "Un texto de prueba que tiene más de treinta caracteres",
      [],
      {
        key: "fake-test-key",
        fetcher: async () => ({
          ok: false,
          status: 500,
          json: async () => ({ error: "PRIVATE_SECRET" }),
        }),
      },
    ),
    (e) =>
      !e.message.includes("PRIVATE_SECRET") &&
      !e.message.includes("fake-test-key"),
  );
});
test("uploaded audio validation examines magic bytes rather than trusting the filename", () => {
  assert.equal(
    validAudio({
      buffer: Buffer.from("not an audio file"),
      mimetype: "audio/mp4",
      originalname: "fake.mp4",
    }),
    false,
  );
  assert.equal(
    validAudio({
      buffer: Buffer.concat([
        Buffer.from([0x1a, 0x45, 0xdf, 0xa3]),
        Buffer.alloc(16),
      ]),
    }),
    true,
  );
});

test("scheduled tracking rotates through accounts and keeps credentials outside the workspace", async () => {
  const prior = process.env.CRON_SECRET;
  process.env.CRON_SECRET = "test-only-cron-secret";
  try {
    const store = createMemoryStore();
    store.shared = true;
    const ws = workspaceService(store);
    for (let i = 0; i < 4; i++)
      await ws.discover("owner", {
        ...raw(String(i)),
        username: `account${i}`,
      });
    await ws.change("owner", (d) => {
      d.automation.enabled = true;
    });
    await store.put("tracking:owners", ["owner"], 100);
    await store.put(
      "tracking:owner",
      {
        token: "test-background-private",
        expires: Date.now() + 86400000,
        cursor: 0,
      },
      100,
    );
    const names = [];
    const handler = cronHandler({
      store,
      request: async (path, params) => {
        assert.equal(params.access_token, "test-background-private");
        const name = /username\(([^)]+)/.exec(params.fields)[1];
        names.push(name);
        return {
          business_discovery: {
            ...raw(name.replace("account", "")),
            username: name,
          },
        };
      },
    });
    let result;
    await handler(
      { get: () => "Bearer test-only-cron-secret" },
      {
        json: (r) => {
          result = r;
        },
      },
    );
    assert.equal(result.synced, 4);
    assert.deepEqual(names, ["account0", "account1", "account2", "account3"]);
    assert.equal((await store.get("tracking:owner")).cursor, 0);
    names.length = 0;
    await handler(
      { get: () => "Bearer test-only-cron-secret" },
      {
        json: (r) => {
          result = r;
        },
      },
    );
    assert.equal(names[0], "account0");
    const data = await ws.read("owner");
    assert.ok(!JSON.stringify(data).includes("test-background-private"));
    assert.equal(data.automation.lastBatch, 4);
  } finally {
    if (prior === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = prior;
  }
});

test("legacy import queries Meta instead of trusting browser metrics and keeps successful accounts on partial failure", async (t) => {
  const fetcher = await serve(t, createMemoryStore(), async (path, params) => {
    if (params.fields.includes("username(denied)"))
      throw new MetaError("Denied", 403);
    return { business_discovery: raw("verified") };
  });
  const res = await fetcher("/pro/import", "POST", {
    usernames: ["nutrition", "denied"],
  });
  assert.equal(res.status, 200);
  const result = await res.json();
  assert.deepEqual(result.failed, ["denied"]);
  assert.equal(result.workspace.accounts[0].id, "verified");
  assert.equal(result.workspace.history.length, 1);
});

test('a reset during an in-flight tracking request cannot recreate data or credentials', async () => {
  const prior=process.env.CRON_SECRET;process.env.CRON_SECRET='test-only-cron-secret';
  try {
    const store=createMemoryStore();store.shared=true;const ws=workspaceService(store);
    await ws.discover('owner',raw());await ws.change('owner',d=>{d.automation.enabled=true;});
    await store.put('tracking:owners',['owner'],100);
    await store.put('tracking:owner',{token:'private-test',jobId:'old-job',expires:Date.now()+86400000},100);
    const handler=cronHandler({store,request:async()=>{
      await ws.change('owner',d=>{d.accounts=[];d.posts=[];d.history=[];d.automation.enabled=false;});
      await store.delete('tracking:owner');
      return {business_discovery:raw()};
    }});
    let output;await handler({get:()=> 'Bearer test-only-cron-secret'},{json:value=>{output=value;}});
    assert.equal(output.synced,0);
    assert.equal((await ws.read('owner')).posts.length,0);
    assert.equal((await ws.read('owner')).history.length,0);
    assert.equal(await store.get('tracking:owner'),null);
  } finally {if(prior===undefined)delete process.env.CRON_SECRET;else process.env.CRON_SECRET=prior;}
});
