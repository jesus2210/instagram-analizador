export class MetaError extends Error {
  constructor(message, status = 502, provider = {}) {
    super(message);
    this.status = status;
    this.providerCode = Number.isFinite(provider.code) ? provider.code : null;
    this.providerSubcode = Number.isFinite(provider.subcode) ? provider.subcode : null;
  }
}

export async function graph(path, params, fetcher = fetch) {
  const url = new URL(`https://graph.facebook.com/v23.0/${path}`);
  for (const [key, value] of Object.entries(params))
    url.searchParams.set(key, value);
  let response;
  try {
    response = await fetcher(url, { signal: AbortSignal.timeout(20000) });
  } catch {
    throw new MetaError(
      "No se pudo contactar con Meta. Revisa la conexión y vuelve a intentarlo.",
    );
  }
  let data;
  try {
    data = await response.json();
  } catch {
    throw new MetaError("Meta devolvió una respuesta no válida.");
  }
  if (!response.ok || data.error) {
    const code = data.error?.code;
    const providerError = (message, status = 502) => new MetaError(message, status, { code, subcode: data.error?.error_subcode });
    if (code === 190)
      throw providerError(
        "Tu sesión de Instagram ha caducado. Vuelve a conectar tu cuenta.",
        401,
      );
    if ([4, 17, 32, 613].includes(code))
      throw providerError(
        "Meta ha limitado las consultas temporalmente. Prueba más tarde.",
        429,
      );
    if ([10, 200].includes(code))
      throw providerError(
        "Faltan permisos de Meta. Revisa los permisos de la app y vuelve a conectar.",
        403,
      );
    throw providerError(
      "Meta no pudo completar la consulta. Comprueba que el usuario sea una cuenta profesional pública y que tu app tenga los permisos necesarios.",
    );
  }
  return data;
}

export function usernameFrom(value) {
  const username = String(value || "")
    .trim()
    .replace(/^@/, "");
  if (!/^[a-zA-Z0-9._]{1,30}$/.test(username))
    throw new MetaError(
      "Escribe el usuario de Instagram, sin el enlace ni espacios.",
      400,
    );
  return username;
}

export function discoveryFields(username) {
  return `business_discovery.username(${usernameFrom(username)}){id,username,name,followers_count,media_count,media.limit(50){id,caption,media_type,media_product_type,permalink,timestamp,like_count,comments_count}}`;
}

export function publicDiscovery(data) {
  const { id, username, name, followers_count, media_count } = data;
  return {
    id,
    username,
    name,
    followers_count,
    media_count,
    media: {
      data: (data.media?.data || []).map((p) => {
        const {
          id,
          caption,
          media_type,
          media_product_type,
          permalink,
          timestamp,
          like_count,
          comments_count,
        } = p;
        return {
          id,
          caption,
          media_type,
          media_product_type,
          permalink,
          timestamp,
          like_count,
          comments_count,
        };
      }),
      // Meta's pagination URLs may contain access tokens. Never send them to a client.
      paging: { hasMore: Boolean(data.media?.paging?.next) },
    },
  };
}
