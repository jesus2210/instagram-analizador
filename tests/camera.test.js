import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { cameraRouter } from "../server/camera.js";
import { createMemoryStore } from "../server/store.js";
const offer = {
  type: "offer",
  sdp: "v=0\r\nm=video 9 UDP/TLS/RTP/SAVPF 96\r\na=fingerprint:sha-256 AA:BB\r\n",
};
const answer = { ...offer, type: "answer" };
async function serve(t) {
  const store = createMemoryStore();
  let now = Date.now();
  const app = express();
  app.use(express.json());
  app.use("/api/camera", cameraRouter({ store, now: () => now }));
  app.use((e, req, res, next) =>
    res.status(e.status || 500).json({ error: e.message }),
  );
  const server = await new Promise((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });
  t.after(() => new Promise((r) => server.close(r)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = (path, method = "GET", body, key, extra = {}) =>
    fetch(base + "/api/camera" + path, {
      method,
      headers: {
        ...(method !== "GET" ? { "content-type": "application/json" } : {}),
        ...(key ? { "x-pulso-camera": key } : {}),
        ...extra,
      },
      ...(method !== "GET" ? { body: JSON.stringify(body || {}) } : {}),
    });
  const create = async (address = "test-client") => {
    const r = await request("/rooms", "POST", {}, null, {
      "x-vercel-forwarded-for": address,
    });
    return { status: r.status, ...(await r.json()) };
  };
  return {
    store,
    request,
    create,
    advance: (ms) => {
      now += ms;
    },
  };
}
test("camera pairing uses separate roles and returns only the opposite description, never keys", async (t) => {
  const { create, request, store } = await serve(t);
  const room = await create();
  assert.equal(room.status, 201);
  const path = `/rooms/${room.id}`;
  assert.equal((await request(path)).status, 404);
  assert.equal((await request(path, "GET", null, "0".repeat(64))).status, 404);
  assert.equal(
    (
      await request(
        path + "/offer",
        "POST",
        { senderId: "a".repeat(32), description: offer },
        room.viewerKey,
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await request(
        path + "/offer",
        "POST",
        { senderId: "a".repeat(32), description: offer },
        room.senderKey,
      )
    ).status,
    200,
  );
  const view = await (await request(path, "GET", null, room.viewerKey)).json();
  assert.deepEqual(view.description, offer);
  assert.ok(!JSON.stringify(view).includes(room.senderKey));
  assert.ok(!JSON.stringify(view).includes(room.viewerKey));
  const stored = await store.get(`camera:room:${room.id}`);
  assert.ok(!JSON.stringify(stored).includes(room.senderKey));
  assert.equal(
    (
      await request(
        path + "/answer",
        "POST",
        { description: answer },
        room.senderKey,
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await request(
        path + "/answer",
        "POST",
        { description: answer },
        room.viewerKey,
      )
    ).status,
    200,
  );
  assert.deepEqual(
    (await (await request(path, "GET", null, room.senderKey)).json())
      .description,
    answer,
  );
});
test("a QR accepts only one sending device even with simultaneous claims", async (t) => {
  const { create, request } = await serve(t);
  const room = await create(),
    path = `/rooms/${room.id}/offer`;
  const results = await Promise.all(
    ["a", "b"].map((c) =>
      request(
        path,
        "POST",
        { senderId: c.repeat(32), description: offer },
        room.senderKey,
      ),
    ),
  );
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
});
test("pairing expires after five minutes, deletion closes both roles, and fresh rooms are rate limited", async (t) => {
  const { create, request, advance } = await serve(t);
  const first = await create();
  assert.equal((await create()).status, 429);
  const second = await create("other-client");
  assert.equal(
    (await request(`/rooms/${first.id}`, "DELETE", {}, first.viewerKey)).status,
    200,
  );
  assert.equal(
    (await request(`/rooms/${first.id}`, "GET", null, first.senderKey)).status,
    404,
  );
  advance(301000);
  assert.equal(
    (await request(`/rooms/${second.id}`, "GET", null, second.viewerKey))
      .status,
    404,
  );
});
test("cross-site room creation, invalid descriptions and role substitution are rejected", async (t) => {
  const { create, request } = await serve(t);
  assert.equal(
    (
      await request("/rooms", "POST", {}, null, {
        origin: "https://untrusted.invalid",
      })
    ).status,
    403,
  );
  const room = await create();
  for (const description of [
    { type: "answer", sdp: offer.sdp },
    { type: "offer", sdp: "not SDP" },
    { type: "offer", sdp: "v=0\r\n" + "x".repeat(60000) },
  ])
    assert.equal(
      (
        await request(
          `/rooms/${room.id}/offer`,
          "POST",
          { senderId: "a".repeat(32), description },
          room.senderKey,
        )
      ).status,
      400,
    );
});
