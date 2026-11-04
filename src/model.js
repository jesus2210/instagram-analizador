export function engagement(post, account) {
  return account?.followers > 0 &&
    post.likesAvailable !== false &&
    post.commentsAvailable !== false
    ? ((post.likes + post.comments) / account.followers) * 100
    : null;
}

export function filterPosts(
  posts,
  { account = "all", format = "all", search = "", days = 0 },
  now = new Date(),
) {
  const query = search.toLocaleLowerCase("es");
  return posts.filter(
    (p) =>
      (account === "all" || p.accountId === account) &&
      (format === "all" || p.format === format) &&
      (!days ||
        (new Date(p.date) <= now &&
          new Date(p.date) >= new Date(now.getTime() - days * 86400000))) &&
      `${p.caption} ${p.topic}`.toLocaleLowerCase("es").includes(query),
  );
}

export function topicFor(caption = "") {
  const text = caption.toLowerCase();
  if (/prote[ií]na|protein|suplement|creatina/.test(text))
    return "Proteínas y suplementos";
  if (/receta|desayuno|cocina|meal|comida/.test(text))
    return "Recetas y alimentación";
  if (/mito|verdad|error|creencia/.test(text)) return "Mitos y educación";
  if (/fuerza|entrena|gym|m[uú]sculo|ejercicio/.test(text))
    return "Entrenamiento";
  if (/h[aá]bito|descanso|sueño|rutina/.test(text)) return "Hábitos saludables";
  return "Nutrición y fitness";
}

export function normalizeDiscovery(data) {
  if (!data?.id || !data.username)
    throw new Error("Instagram no devolvió una cuenta profesional válida.");
  const account = {
    id: String(data.id),
    username: data.username,
    name: data.name || data.username,
    followers: data.followers_count ?? null,
    mediaCount: data.media_count ?? null,
    syncedAt: new Date().toISOString(),
    demo: false,
  };
  const posts = (data.media?.data || []).map((p) => ({
    id: String(p.id),
    accountId: account.id,
    caption: p.caption || "Publicación sin descripción",
    format:
      p.media_product_type === "REELS"
        ? "reel"
        : p.media_type === "CAROUSEL_ALBUM"
          ? "carousel"
          : p.media_type === "VIDEO"
            ? "video"
            : "image",
    date: p.timestamp,
    likes: Math.max(0, Number(p.like_count) || 0),
    comments: Math.max(0, Number(p.comments_count) || 0),
    likesAvailable: p.like_count != null,
    commentsAvailable: p.comments_count != null,
    url: p.permalink || "",
    topic: topicFor(p.caption),
  }));
  return { account, posts, hasMore: Boolean(data.media?.paging?.hasMore) };
}

export function mergeDiscovery(store, result) {
  // A sync replaces this account's sampled posts; never doubles their metrics.
  return {
    ...store,
    demo: false,
    accounts: [
      ...store.accounts.filter((a) => a.id !== result.account.id),
      result.account,
    ],
    posts: [
      ...store.posts.filter((p) => p.accountId !== result.account.id),
      ...result.posts,
    ],
  };
}

export function buildIdeas(posts, accounts) {
  const ranked = [...posts]
    .filter((p) => accounts.some((a) => a.id === p.accountId))
    .sort(
      (a, b) =>
        (engagement(
          b,
          accounts.find((x) => x.id === b.accountId),
        ) ?? -1) -
        (engagement(
          a,
          accounts.find((x) => x.id === a.accountId),
        ) ?? -1),
    );
  const themes = new Set();
  const distinct = ranked.filter((p) => {
    if (themes.has(p.topic)) return false;
    themes.add(p.topic);
    return true;
  });
  return distinct
    .slice(0, 6)
    .map((p) => ({
      id: `idea-${p.id}`,
      sourceId: p.id,
      topic: p.topic,
      title:
        p.topic === "Proteínas y suplementos"
          ? "Proteína en un día real: tres opciones a tu alcance"
          : p.topic === "Recetas y alimentación"
            ? "Un plato, tres versiones: ajusta tu comida a tu día"
            : p.topic === "Mitos y educación"
              ? "Lo que este consejo de fitness deja fuera de contexto"
              : p.topic === "Entrenamiento"
                ? "Un movimiento, tres niveles: encuentra tu punto de partida"
                : "El pequeño hábito que puedes probar esta semana",
      hook: "“Antes de cambiar toda tu rutina, prueba esto…”",
      structure:
        "Abre con una pregunta concreta → enseña un ejemplo práctico → explica para quién puede servir → invita a compartir experiencias.",
      reason: `Referencia de ${p.topic.toLowerCase()} con ${new Intl.NumberFormat("es").format(p.likes + p.comments)} interacciones públicas. Adapta el enfoque a tu experiencia y cita fuentes cuando hagas afirmaciones de salud.`,
    }));
}

export function demoStore() {
  const accounts = [
    {
      id: "demo-1",
      name: "Clara Nutrición",
      username: "clara.nutri.demo",
      followers: 28400,
      demo: true,
    },
    {
      id: "demo-2",
      name: "Marcos en Movimiento",
      username: "marcos.fit.demo",
      followers: 45600,
      demo: true,
    },
    {
      id: "demo-3",
      name: "Plato y Equilibrio",
      username: "plato.equilibrio.demo",
      followers: 19200,
      demo: true,
    },
  ];
  const samples = [
    [
      "demo-1",
      "reel",
      "¿Necesitas tanta proteína como crees? 3 ejemplos para entenderlo sin complicarte.",
      "Proteínas y suplementos",
      3840,
      186,
      1,
    ],
    [
      "demo-2",
      "reel",
      "Tres errores al empezar a entrenar fuerza y cómo adaptar el ejercicio a tu nivel.",
      "Entrenamiento",
      5200,
      241,
      2,
    ],
    [
      "demo-3",
      "carousel",
      "5 desayunos que preparo en menos de 10 minutos. Guarda estas recetas para una mañana con prisa.",
      "Recetas y alimentación",
      2120,
      94,
      3,
    ],
    [
      "demo-1",
      "carousel",
      "Comer carbohidratos por la noche: revisamos el mito y lo que dice la evidencia.",
      "Mitos y educación",
      2760,
      203,
      5,
    ],
    [
      "demo-2",
      "reel",
      "Así adapto una rutina de fuerza cuando solo tengo 20 minutos para entrenar.",
      "Entrenamiento",
      3180,
      118,
      7,
    ],
    [
      "demo-3",
      "reel",
      "Una comida, tres versiones. Ideas sencillas para organizar el plato sin contar todo.",
      "Recetas y alimentación",
      1840,
      71,
      9,
    ],
    [
      "demo-1",
      "image",
      "Dormir también forma parte del plan. Un hábito pequeño para una semana más descansada.",
      "Hábitos saludables",
      960,
      56,
      12,
    ],
    [
      "demo-2",
      "carousel",
      "Creatina: preguntas frecuentes, límites y por qué el contexto importa.",
      "Proteínas y suplementos",
      2400,
      133,
      16,
    ],
    [
      "demo-3",
      "image",
      "No necesitas una alimentación perfecta para empezar a cuidarte.",
      "Hábitos saludables",
      1120,
      62,
      21,
    ],
    [
      "demo-1",
      "reel",
      "¿Los suplementos sustituyen una buena alimentación? Hablemos de prioridades.",
      "Proteínas y suplementos",
      3140,
      154,
      25,
    ],
    [
      "demo-2",
      "reel",
      "Más no siempre es mejor: aprende a incluir descanso en tu rutina de entrenamiento.",
      "Hábitos saludables",
      1820,
      82,
      35,
    ],
    [
      "demo-3",
      "carousel",
      "Ideas de recetas para preparar legumbres de otra forma esta semana.",
      "Recetas y alimentación",
      1430,
      67,
      40,
    ],
  ];
  const posts = samples.map(
    ([accountId, format, caption, topic, likes, comments, days], i) => ({
      id: `sample-${i}`,
      accountId,
      format,
      caption,
      topic,
      likes,
      comments,
      likesAvailable: true,
      date: new Date(Date.now() - days * 86400000).toISOString(),
      url: "",
    }),
  );
  return { version: 1, demo: true, accounts, posts, savedIdeas: [] };
}

export function emptyStore() {
  return { version: 1, demo: false, accounts: [], posts: [], savedIdeas: [] };
}

export function safeInstagramUrl(value) {
  try {
    const u = new URL(value);
    return (
      u.protocol === "https:" &&
      ["instagram.com", "www.instagram.com"].includes(u.hostname)
    );
  } catch {
    return false;
  }
}
