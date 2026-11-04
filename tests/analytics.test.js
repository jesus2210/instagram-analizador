import test from "node:test";
import assert from "node:assert/strict";
import {
  benchmarks,
  patterns,
  recordSnapshot,
  snapshot,
  growth,
  learning,
} from "../src/analytics.js";
const now = new Date("2026-10-27T12:00:00Z");
const post = (id, likes, extra = {}) => ({
  id,
  accountId: "a",
  format: "reel",
  topic: "Recetas",
  likes,
  comments: 0,
  date: "2026-10-20T12:00:00Z",
  ...extra,
});
test("benchmarks exclude the target, use a robust median and require comparable age and format", () => {
  const rows = [
    post("winner", 1000),
    ...["b", "c", "d", "e", "f"].map((id, i) =>
      post(id, [10, 10, 10, 10, 500][i]),
    ),
    post("image", 9999, { format: "image" }),
    post("old", 9999, { date: "2026-09-01" }),
    post("new", 9999, { date: "2026-10-27" }),
  ];
  const winner = benchmarks(rows, now)[0];
  assert.equal(winner.baseline, 10);
  assert.equal(winner.multiplier, 100);
  assert.equal(winner.peerCount, 5);
  assert.equal(benchmarks(rows, now).at(-1).multiplier, null);
});
test("missing counts, future timestamps, zero medians and small samples never produce a confident score", () => {
  for (const rows of [
    [post("a", 20)],
    Array.from({ length: 5 }, (_, i) => post(String(i), 0)),
  ])
    assert.ok(benchmarks(rows, now).every((p) => p.multiplier === null));
  const rows = Array.from({ length: 6 }, (_, i) => post(String(i), 10));
  rows[0].likesAvailable = false;
  rows[1].date = "2030-01-01";
  assert.equal(benchmarks(rows, now)[0].multiplier, null);
  assert.equal(benchmarks(rows, now)[1].multiplier, null);
});
test("topic evidence weights creators equally and distinguishes repeated signals", () => {
  const rows = [
    ...Array.from({ length: 9 }, (_, i) => ({
      ...post(String(i), 10),
      multiplier: 10,
    })),
    { ...post("other", 10, { accountId: "b" }), multiplier: 2 },
  ];
  const result = patterns(rows)[0];
  assert.equal(result.score, 6);
  assert.equal(result.repeated, true);
  assert.equal(result.accountCount, 2);
  assert.equal(patterns(rows.slice(0, 9))[0].repeated, false);
});
test("daily snapshots upsert, bound retention to 90 per creator and preserve other creators", () => {
  let rows = [snapshot({ id: "b", followers: 10 }, [], now)];
  for (let i = 0; i < 100; i++)
    rows = recordSnapshot(
      rows,
      snapshot(
        { id: "a", followers: i },
        [],
        new Date(now.getTime() + i * 86400000),
      ),
    );
  assert.equal(rows.filter((r) => r.accountId === "a").length, 90);
  assert.equal(rows.filter((r) => r.accountId === "b").length, 1);
  rows = recordSnapshot(
    rows,
    snapshot(
      { id: "a", followers: 1000 },
      [],
      new Date(now.getTime() + 99 * 86400000 + 3600000),
    ),
  );
  assert.equal(rows.filter((r) => r.accountId === "a").length, 90);
  assert.equal(rows.at(-1).followers, 1000);
});
test("growth compares only complete overlapping posts and retains negative deltas", () => {
  const history = [
    {
      accountId: "a",
      at: "2026-10-20",
      followers: 100,
      posts: [
        { id: "1", likes: 20, comments: 2 },
        { id: "2", likes: null, comments: 2 },
        { id: "removed", likes: 500, comments: 2 },
      ],
    },
    {
      accountId: "a",
      at: "2026-10-21",
      followers: 99,
      posts: [
        { id: "1", likes: 15, comments: 2 },
        { id: "2", likes: 100, comments: 2 },
        { id: "new", likes: 999, comments: 2 },
      ],
    },
  ];
  const result = growth(history, "a");
  assert.equal(result.interactionsDelta, -5);
  assert.equal(result.followersDelta, -1);
  assert.equal(result.commonPosts, 1);
  assert.equal(growth(history.slice(1), "a"), null);
});
test("learning uses only ideas explicitly linked to an existing owned publication", () => {
  assert.equal(
    learning(
      [post("1", 20)],
      [
        { id: "a", publishedPostId: "1" },
        { id: "b", publishedPostId: "other" },
      ],
    ).length,
    1,
  );
});
