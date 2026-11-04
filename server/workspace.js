import { MetaError } from "./meta.js";
import { normalizeDiscovery } from "../src/model.js";
import { recordSnapshot, snapshot } from "../src/analytics.js";
export const RETENTION = 180 * 86400;
export const freshWorkspace = () => ({
  version: 1,
  revision: 0,
  accounts: [],
  posts: [],
  savedIdeas: [],
  history: [],
  briefs: [],
  videoAnalyses: [],
  profile: {
    audience: "Adultos que buscan mejorar su alimentación y entrenamiento",
    goal: "Educar y atraer consultas",
    tone: "Cercano y basado en evidencia",
  },
  automation: { enabled: false },
  own: null,
});
export function workspaceService(store) {
  const key = (owner) => `workspace:${owner}`;
  return {
    async read(owner) {
      return (await store.get(key(owner))) || freshWorkspace();
    },
    async change(owner, mutate, revision) {
      const lock = `workspace-lock:${owner}`;
      if (!(await store.acquire(lock, 45)))
        throw new MetaError(
          "Tu espacio se está actualizando. Inténtalo de nuevo.",
          409,
        );
      try {
        const data = await this.read(owner);
        if (revision != null && revision !== data.revision)
          throw new MetaError(
            "Hay cambios en otro dispositivo. Recarga los datos antes de guardar.",
            409,
          );
        await mutate(data);
        data.revision++;
        data.updatedAt = new Date().toISOString();
        if (Buffer.byteLength(JSON.stringify(data)) > 1800000)
          throw new MetaError(
            "El espacio ha alcanzado su límite. Exporta y elimina referencias antiguas.",
            413,
          );
        await store.put(key(owner), data, RETENTION);
        return data;
      } finally {
        await store.delete(lock);
      }
    },
    async discover(owner, raw, now = new Date()) {
      return this.discoverMany(owner, [raw], now);
    },
    async discoverMany(owner, raws, now = new Date()) {
      return this.change(owner, (data) => applyDiscoveries(data, raws, now));
    },

    async update(owner, input) {
      if (!Number.isInteger(input.revision))
        throw new MetaError("Recarga el espacio antes de guardar.", 400);
      return this.change(
        owner,
        (data) => {
          if (input.profile)
            data.profile = {
              audience: text(input.profile.audience, 300),
              goal: text(input.profile.goal, 300),
              tone: text(input.profile.tone, 200),
            };
          if (input.savedIdeas) {
            if (
              !Array.isArray(input.savedIdeas) ||
              input.savedIdeas.length > 100
            )
              throw new MetaError("Máximo 100 ideas guardadas.", 400);
            data.savedIdeas = input.savedIdeas.map((i) => ({
              id: text(i.id, 100),
              sourceId: text(i.sourceId, 100),
              topic: text(i.topic, 200),
              title: text(i.title, 300),
              hook: text(i.hook, 1000),
              structure: text(i.structure, 5000),
              reason: text(i.reason, 2000),
              notes: text(i.notes, 5000),
              savedAt: text(i.savedAt, 50),
              publishedPostId: text(i.publishedPostId, 100),
            }));
          }
        },
        input.revision,
      );
    },
  };
}
export function text(value, limit) {
  return typeof value === "string" ? value.slice(0, limit).trim() : "";
}

export function applyDiscoveries(data, raws, now = new Date()) {
  for (const raw of raws) {
    const result = normalizeDiscovery(raw);
    const index = data.accounts.findIndex((a) => a.id === result.account.id);
    if (index < 0 && data.accounts.length >= 20)
      throw new MetaError(
        "Puedes seguir hasta 20 competidores por espacio.",
        400,
      );
    if (index < 0) data.accounts.push(result.account);
    else data.accounts[index] = result.account;
    data.posts = [
      ...data.posts.filter((p) => p.accountId !== result.account.id),
      ...result.posts,
    ];
    data.history = recordSnapshot(
      data.history,
      snapshot(result.account, result.posts, now),
    );
  }
}
