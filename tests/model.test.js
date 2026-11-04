import test from "node:test";
import assert from "node:assert/strict";
import {
  engagement,
  filterPosts,
  normalizeDiscovery,
  mergeDiscovery,
  emptyStore,
  demoStore,
  buildIdeas,
  safeInstagramUrl,
  topicFor,
} from "../src/model.js";
import {
  usernameFrom,
  discoveryFields,
  graph,
  publicDiscovery,
} from "../server/meta.js";

test("engagement uses public interactions divided by current followers", () => {
  assert.equal(
    engagement({ likes: 90, comments: 10 }, { followers: 1000 }),
    10,
  );
  assert.equal(
    engagement(
      { likes: 0, comments: 10, likesAvailable: false },
      { followers: 1000 },
    ),
    null,
  );
  assert.equal(engagement({ likes: 90, comments: 10 }, { followers: 0 }), null);
  assert.equal(engagement({ likes: 90, comments: 10 }, null), null);
});
test("account, format, query and date filters compose correctly", () => {
  const posts = [
    {
      id: "1",
      accountId: "a",
      format: "reel",
      caption: "Proteína",
      topic: "Fitness",
      date: "2026-10-20",
    },
    {
      id: "2",
      accountId: "b",
      format: "reel",
      caption: "Proteína",
      topic: "Fitness",
      date: "2026-10-20",
    },
    {
      id: "3",
      accountId: "a",
      format: "image",
      caption: "Proteína",
      topic: "Fitness",
      date: "2026-10-20",
    },
    {
      id: "4",
      accountId: "a",
      format: "reel",
      caption: "Proteína",
      topic: "Fitness",
      date: "2026-08-20",
    },
    {
      id: "5",
      accountId: "a",
      format: "reel",
      caption: "Proteína",
      topic: "Fitness",
      date: "2026-12-20",
    },
  ];
  assert.deepEqual(
    filterPosts(
      posts,
      { account: "a", format: "reel", search: "PROTEÍNA", days: 30 },
      new Date("2026-10-26"),
    ).map((p) => p.id),
    ["1"],
  );
});
test("Meta discovery preserves absent metrics and detects Reels and carousels", () => {
  const data = normalizeDiscovery({
    id: "a",
    username: "nutrition",
    followers_count: 200,
    media: {
      data: [
        {
          id: "1",
          media_product_type: "REELS",
          media_type: "VIDEO",
          timestamp: "2026-10-20",
          comments_count: 3,
        },
        {
          id: "2",
          media_type: "CAROUSEL_ALBUM",
          like_count: 5,
          comments_count: 2,
          caption: "Una receta",
        },
      ],
      paging: { hasMore: true },
    },
  });
  assert.equal(data.posts[0].format, "reel");
  assert.equal(data.posts[0].likesAvailable, false);
  assert.equal(data.posts[1].format, "carousel");
  assert.equal(data.posts[1].topic, "Recetas y alimentación");
  assert.equal(data.hasMore, true);
  assert.throws(() => normalizeDiscovery({ username: "missing-id" }));
});
test("sync is idempotent and preserves other accounts and saved ideas", () => {
  const initial = {
    ...emptyStore(),
    accounts: [{ id: "b" }],
    posts: [{ id: "2", accountId: "b" }],
    savedIdeas: [{ id: "my-idea" }],
  };
  const result = { account: { id: "a" }, posts: [{ id: "1", accountId: "a" }] };
  const once = mergeDiscovery(initial, result);
  assert.deepEqual(mergeDiscovery(once, result), once);
  assert.equal(once.posts.length, 2);
  assert.deepEqual(once.savedIdeas, initial.savedIdeas);
});
test("ideas are tied to references and do not duplicate topics", () => {
  const store = demoStore();
  const ideas = buildIdeas(store.posts, store.accounts);
  assert.ok(ideas.length > 0);
  assert.equal(new Set(ideas.map((i) => i.topic)).size, ideas.length);
  assert.ok(ideas.every((i) => store.posts.some((p) => p.id === i.sourceId)));
  assert.deepEqual(buildIdeas([], []), []);
});
test("only HTTPS Instagram URLs can open from the library", () => {
  assert.equal(safeInstagramUrl("https://www.instagram.com/p/abc/"), true);
  for (const url of [
    "javascript:alert(1)",
    "https://instagram.com.attacker.com/a",
    "http://instagram.com/a",
    "not a url",
  ])
    assert.equal(safeInstagramUrl(url), false);
});
test("topics are derived from content keywords", () => {
  assert.equal(topicFor("Desayuno de hoy"), "Recetas y alimentación");
  assert.equal(topicFor("ENTRENAR FUERZA"), "Entrenamiento");
});
test("discovery usernames cannot inject Graph fields", () => {
  assert.equal(usernameFrom("@clara.nutri"), "clara.nutri");
  for (const value of [
    "",
    "a){id}",
    "https://instagram.com/a",
    "a b",
    "x".repeat(31),
  ])
    assert.throws(() => usernameFrom(value));
  assert.ok(
    discoveryFields("clara").startsWith("business_discovery.username(clara){"),
  );
  assert.ok(!discoveryFields("clara").includes("saved"));
});
test("Meta requests retain HTTPS and do not expose error payloads", async () => {
  const result = await graph(
    "123",
    { access_token: "synthetic-test-token" },
    async (url) => {
      assert.equal(url.protocol, "https:");
      assert.equal(url.hostname, "graph.facebook.com");
      return { ok: true, json: async () => ({ id: "123" }) };
    },
  );
  assert.equal(result.id, "123");
  await assert.rejects(
    graph("123", {}, async () => ({
      ok: false,
      json: async () => ({
        error: { code: 190, message: "sensitive-provider-error" },
      }),
    })),
    (e) => e.status === 401 && !e.message.includes("sensitive-provider-error"),
  );
  await assert.rejects(
    graph("123", {}, async () => ({
      ok: false,
      json: async () => ({ error: { code: 4 } }),
    })),
    (e) => e.status === 429,
  );
  await assert.rejects(
    graph("123", {}, async () => {
      throw new Error("token in error");
    }),
    /No se pudo contactar/,
  );
});

test("public discovery never exposes Meta pagination tokens or unexpected fields", () => {
  const result = publicDiscovery({
    id: "a",
    username: "test",
    access_token: "private-test-token",
    media: {
      data: [
        {
          id: "1",
          caption: "Public caption",
          access_token: "private-test-token",
        },
      ],
      paging: {
        next: "https://graph.facebook.com/next?access_token=private-test-token",
        cursors: { after: "private-cursor" },
      },
    },
  });
  assert.equal(result.media.paging.hasMore, true);
  assert.equal(result.media.data[0].caption, "Public caption");
  assert.ok(!JSON.stringify(result).includes("private-"));
  assert.ok(!JSON.stringify(result).includes("access_token"));
});
