const DAY = 86400000;
export const complete = (p) =>
  p.likesAvailable !== false &&
  p.commentsAvailable !== false &&
  Number.isFinite(p.likes) &&
  Number.isFinite(p.comments);
export const interactions = (p) => (complete(p) ? p.likes + p.comments : null);
export function median(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  const n = sorted.length;
  return n
    ? (sorted[Math.floor(n / 2)] + sorted[Math.ceil(n / 2) - 1]) / 2
    : null;
}
const ageGroup = (days) =>
  days < 2
    ? "recent"
    : days <= 7
      ? "2–7 días"
      : days <= 30
        ? "8–30 días"
        : "Más de 30 días";
export function benchmarks(posts, now = new Date()) {
  const eligible = posts.filter(
    (p) =>
      complete(p) &&
      Number.isFinite(Date.parse(p.date)) &&
      new Date(p.date) <= now,
  );
  return posts.map((post) => {
    const age = (now - new Date(post.date)) / DAY;
    const group = ageGroup(age);
    const peers = eligible.filter(
      (p) =>
        p.id !== post.id &&
        p.accountId === post.accountId &&
        p.format === post.format &&
        ageGroup((now - new Date(p.date)) / DAY) === group,
    );
    const baseline = median(peers.map(interactions));
    const enough =
      complete(post) && age >= 2 && peers.length >= 4 && baseline > 0;
    return {
      ...post,
      baseline,
      peerCount: peers.length,
      ageGroup: group,
      multiplier: enough ? interactions(post) / baseline : null,
      confidence: enough
        ? peers.length >= 10
          ? "Muestra amplia"
          : "Muestra inicial"
        : "Datos insuficientes",
    };
  });
}
export function patterns(ranked) {
  const topics = [...new Set(ranked.map((p) => p.topic))];
  return topics
    .map((topic) => {
      const refs = ranked.filter(
        (p) => p.topic === topic && p.multiplier != null,
      );
      const accountIds = [...new Set(refs.map((p) => p.accountId))];
      // Each creator gets the same weight, regardless of posting frequency.
      const score = median(
        accountIds.map((id) =>
          median(
            refs.filter((p) => p.accountId === id).map((p) => p.multiplier),
          ),
        ),
      );
      return {
        topic,
        count: refs.length,
        accountCount: accountIds.length,
        score,
        repeated: refs.length >= 3 && accountIds.length >= 2,
        refs: [...refs].sort((a, b) => b.multiplier - a.multiplier).slice(0, 3),
      };
    })
    .filter((p) => p.count)
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
}
export function snapshot(account, posts, now = new Date()) {
  return {
    accountId: account.id,
    at: now.toISOString(),
    followers: account.followers,
    posts: posts
      .slice(0, 50)
      .map((p) => ({
        id: p.id,
        likes: complete(p) ? p.likes : null,
        comments: complete(p) ? p.comments : null,
      })),
  };
}
export function recordSnapshot(history = [], next) {
  const day = next.at.slice(0, 10);
  const others = history.filter((s) => s.accountId !== next.accountId);
  const own = history.filter(
    (s) => s.accountId === next.accountId && s.at.slice(0, 10) !== day,
  );
  return [...others, ...own, next]
    .sort((a, b) => a.at.localeCompare(b.at))
    .filter(
      (s) =>
        s.accountId !== next.accountId ||
        [...own, next]
          .sort((a, b) => b.at.localeCompare(a.at))
          .slice(0, 90)
          .some((x) => x.at === s.at),
    );
}
export function growth(history, accountId) {
  const rows = history
    .filter((s) => s.accountId === accountId)
    .sort((a, b) => a.at.localeCompare(b.at));
  if (rows.length < 2) return null;
  const first = rows.at(-2),
    last = rows.at(-1);
  if (new Date(last.at) - new Date(first.at) < 6 * 3600000) return null;
  const common = last.posts
    .map((p) => ({ p, old: first.posts.find((x) => x.id === p.id) }))
    .filter(
      ({ p, old }) =>
        old &&
        [p.likes, p.comments, old.likes, old.comments].every(Number.isFinite),
    );
  return {
    from: first.at,
    to: last.at,
    followersDelta:
      Number.isFinite(first.followers) && Number.isFinite(last.followers)
        ? last.followers - first.followers
        : null,
    interactionsDelta: common.length
      ? common.reduce(
          (sum, { p, old }) =>
            sum + p.likes + p.comments - old.likes - old.comments,
          0,
        )
      : null,
    commonPosts: common.length,
    hours: (new Date(last.at) - new Date(first.at)) / 3600000,
  };
}
export function learning(ownPosts, ideas) {
  const linked = ideas.filter(
    (i) =>
      i.publishedPostId && ownPosts.some((p) => p.id === i.publishedPostId),
  );
  const ranked = benchmarks(ownPosts);
  return linked.map((i) => ({
    idea: i,
    post: ranked.find((p) => p.id === i.publishedPostId),
  }));
}
