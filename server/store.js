import { createHash } from "node:crypto";
import { MetaError } from "./meta.js";

export function createMemoryStore() {
  const values = new Map();
  const clean = () => {
    for (const [key, entry] of values)
      if (entry.expires <= Date.now()) values.delete(key);
  };
  return {
    shared: false,
    async get(key) {
      clean();
      return values.has(key) ? structuredClone(values.get(key).value) : null;
    },
    async put(key, value, ttl) {
      clean();
      if (values.size >= 5000 && !values.has(key))
        throw new MetaError("Demasiadas sesiones. Inténtalo más tarde.", 503);
      values.set(key, {
        value: structuredClone(value),
        expires: Date.now() + ttl * 1000,
      });
    },
    async take(key) {
      clean();
      const value = values.get(key)?.value ?? null;
      values.delete(key);
      return value;
    },
    async delete(key) {
      values.delete(key);
    },
    async acquire(key, ttl) {
      clean();
      if (values.has(key)) return false;
      await this.put(key, true, ttl);
      return true;
    },
  };
}

export function createRedisStore({
  url,
  token,
  namespace = "pulso",
  fetcher = fetch,
}) {
  const endpoint = new URL(url);
  if (endpoint.protocol !== "https:" || endpoint.username || endpoint.password)
    throw new Error(
      "Redis REST requiere una URL HTTPS sin credenciales incrustadas.",
    );
  const prefix = `pulso:${createHash("sha256").update(namespace).digest("hex").slice(0, 16)}:`;
  async function command(args) {
    try {
      const response = await fetcher(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(args),
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) throw new Error();
      const data = await response.json();
      if (data.error) throw new Error();
      return data.result;
    } catch {
      throw new MetaError(
        "No se pudo acceder al almacén de sesiones. Revisa la configuración de Redis del servidor.",
        503,
      );
    }
  }
  return {
    shared: true,
    async get(key) {
      const value = await command(["GET", prefix + key]);
      return value == null ? null : JSON.parse(value);
    },
    async put(key, value, ttl) {
      await command([
        "SET",
        prefix + key,
        JSON.stringify(value),
        "EX",
        Math.max(1, Math.ceil(ttl)),
      ]);
    },
    async take(key) {
      const value = await command(["GETDEL", prefix + key]);
      return value == null ? null : JSON.parse(value);
    },
    async delete(key) {
      await command(["DEL", prefix + key]);
    },
    async acquire(key, ttl) {
      return (
        (await command(["SET", prefix + key, "1", "EX", ttl, "NX"])) === "OK"
      );
    },
  };
}

export function configuredStore(env = process.env) {
  const useUpstash = env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN;
  const url = useUpstash ? env.UPSTASH_REDIS_REST_URL : env.KV_REST_API_URL;
  const token = useUpstash
    ? env.UPSTASH_REDIS_REST_TOKEN
    : env.KV_REST_API_TOKEN;
  return url && token
    ? createRedisStore({ url, token, namespace: env.APP_URL || "development" })
    : createMemoryStore();
}
