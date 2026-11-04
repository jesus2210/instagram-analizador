import React, { useState, useEffect, useRef } from "react";
import {
  Sparkles,
  TrendingUp,
  RefreshCw,
  ExternalLink,
  Bookmark,
  Film,
  Check,
  ArrowUpRight,
} from "lucide-react";
import {
  benchmarks,
  patterns,
  growth,
  learning,
  interactions,
} from "./analytics.js";
import { safeInstagramUrl } from "./model.js";
import { prepareVideo } from "./video.js";
const n = (v) =>
  v == null
    ? "—"
    : new Intl.NumberFormat("es", { maximumFractionDigits: 1 }).format(v);
const when = (v) => (v ? new Date(v).toLocaleString("es-CL") : "—");
function Reference({ post, accounts, onOpen }) {
  return (
    <button className="pro-reference" onClick={() => onOpen(post)}>
      <span>
        @
        {accounts.find((a) => a.id === post.accountId)?.username ||
          "referencia"}{" "}
        · {post.format}
      </span>
      <strong>{post.caption.slice(0, 120)}</strong>
      <span>
        {post.multiplier != null
          ? `${n(post.multiplier)}× su mediana · ${post.peerCount} comparables`
          : `${n(interactions(post))} interacciones`}
      </span>
      <ArrowUpRight size={15} />
    </button>
  );
}
export default function Pro({
  page,
  store,
  cloud,
  connection,
  capabilities,
  onRefresh,
  onChange,
  onOpen,
  onSave,
  postRequest,
  setToast,
}) {
  const [busy, setBusy] = useState(""),
    [error, setError] = useState("");
  const [profile, setProfile] = useState(
    cloud?.profile || {
      audience: "Adultos que buscan mejorar su alimentación y entrenamiento",
      goal: "Educar y atraer consultas",
      tone: "Cercano y basado en evidencia",
    },
  );
  const [transcript, setTranscript] = useState(""),
    [video, setVideo] = useState(null),
    [progress, setProgress] = useState(0),
    [videoTitle, setVideoTitle] = useState("");
  const [tab, setTab] = useState("briefs"),
    [account, setAccount] = useState("all");
  const abort = useRef(null);
  useEffect(() => {
    if (cloud?.profile) setProfile(cloud.profile);
  }, [cloud?.profile]);
  useEffect(() => () => abort.current?.abort(), []);
  const ranked = benchmarks(store.posts),
    standouts = ranked
      .filter((p) => p.multiplier != null && p.multiplier >= 1.5)
      .sort((a, b) => b.multiplier - a.multiplier),
    groups = patterns(ranked);
  const history = cloud?.history || [],
    own = cloud?.own;
  async function run(name, fn) {
    setBusy(name);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy("");
    }
  }
  const locked = !connection.connected || Boolean(busy);
  async function request(path, body) {
    return postRequest(`pro/${path}`, body);
  }
  async function saveProfile() {
    onChange(await request("workspace", { revision: cloud.revision, profile }));
    setToast("Audiencia y objetivo guardados.");
  }
  async function videoAnalysis() {
    if (video) {
      abort.current = new AbortController();
      setProgress(0);
      const prepared = await prepareVideo(
        video,
        setProgress,
        abort.current.signal,
      );
      if (abort.current.signal.aborted) throw new Error("Análisis cancelado.");
      setProgress(100);
      const form = new FormData();
      form.set("audio", prepared.audio, `audio.${prepared.extension}`);
      form.set("frames", JSON.stringify(prepared.frames));
      form.set("title", videoTitle || video.name);
      const res = await fetch("/api/instagram/pro/video", {
        method: "POST",
        credentials: "same-origin",
        headers: { "X-CSRF-Token": connection.csrf },
        body: form,
        signal: abort.current.signal,
      });
      const data = await res.json();
      if (!res.ok)
        throw new Error(data.error || "No se pudo analizar el vídeo.");
    } else {
      const form = new FormData();
      form.set("transcript", transcript);
      form.set("title", videoTitle);
      const res = await fetch("/api/instagram/pro/video", {
        method: "POST",
        credentials: "same-origin",
        headers: { "X-CSRF-Token": connection.csrf },
        body: form,
      });
      const data = await res.json();
      if (!res.ok)
        throw new Error(data.error || "No se pudo analizar la transcripción.");
    }
    await onRefresh();
    setToast("Análisis guardado en tu estudio.");
  }
  return (
    <div className="pro-space">
      {store.demo && (
        <div className="notice">
          <Sparkles size={18} />
          Estás explorando datos ficticios. Los guiones con IA y las
          estadísticas propias usan únicamente tu espacio real conectado.
        </div>
      )}
      {error && (
        <div className="notice error" role="alert">
          {error}
        </div>
      )}
      {!connection.connected && (
        <div className="notice">
          Conecta Instagram para guardar tu historial, activar la IA y consultar
          tus resultados. Puedes explorar el análisis de la muestra.
        </div>
      )}
      {page === "analysis" && (
        <>
          <div className="pro-banner">
            <div>
              <span className="eyebrow">EVIDENCIA ANTES QUE INTUICIÓN</span>
              <h2>Encuentra lo que se sale de lo habitual.</h2>
              <p>
                Comparamos publicaciones de la misma cuenta, formato y franja de
                antigüedad. Cada referencia se excluye de su propia mediana.
              </p>
            </div>
            <div className="pro-banner-stat">
              <strong>{standouts.length}</strong>
              <span>referencias ≥ 1,5×</span>
            </div>
          </div>
          <div className="pro-grid">
            <section className="pro-panel">
              <div className="section-heading">
                <h2>Publicaciones que destacan</h2>
                <TrendingUp size={19} />
              </div>
              <p className="muted">
                Mínimo 4 referencias comparables. Publicaciones de menos de 48
                horas quedan fuera del ranking.
              </p>
              {standouts.slice(0, 8).map((p) => (
                <Reference
                  key={p.id}
                  post={p}
                  accounts={store.accounts}
                  onOpen={onOpen}
                />
              ))}
              {!standouts.length && (
                <div className="pro-empty">
                  Aún no hay publicaciones con una muestra suficiente que
                  superen 1,5 veces su mediana. Sincroniza más contenido;
                  evitamos sacar conclusiones de pocas publicaciones.
                </div>
              )}
            </section>
            <section className="pro-panel">
              <div className="section-heading">
                <h2>Patrones por tema</h2>
                <Sparkles size={19} />
              </div>
              <p className="muted">
                Clasificación por palabras de la descripción. Cada creador tiene
                el mismo peso en la mediana del tema.
              </p>
              {groups.map((g) => (
                <div className="pro-pattern" key={g.topic}>
                  <span className={`pro-badge ${g.repeated ? "positive" : ""}`}>
                    {g.repeated
                      ? "Se repite entre cuentas"
                      : "Señal exploratoria"}
                  </span>
                  <h3>{g.topic}</h3>
                  <p>
                    <strong>{n(g.score)}×</strong> su rendimiento habitual ·{" "}
                    {g.count} publicaciones · {g.accountCount} cuentas
                  </p>
                  {g.refs.slice(0, 2).map((p) => (
                    <Reference
                      key={p.id}
                      post={p}
                      accounts={store.accounts}
                      onOpen={onOpen}
                    />
                  ))}
                </div>
              ))}
              {!groups.length && (
                <div className="pro-empty">
                  Los patrones aparecerán cuando haya publicaciones comparables.
                  Necesitamos al menos 3 referencias de 2 cuentas para marcar un
                  patrón como repetido.
                </div>
              )}
            </section>
          </div>
          <section className="pro-panel">
            <div className="section-heading">
              <h2>Historial y evolución observada</h2>
              <label>
                Cuenta{" "}
                <select
                  aria-label="Cuenta del historial"
                  value={account}
                  onChange={(e) => setAccount(e.target.value)}
                >
                  <option value="all">Todas</option>
                  {store.accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      @{a.username}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <p className="muted">
              Hasta 90 mediciones diarias por cuenta. Las diferencias usan solo
              publicaciones presentes en ambas mediciones; los descensos también
              se conservan.
            </p>
            <div className="pro-history-grid">
              {store.accounts
                .filter((a) => account === "all" || a.id === account)
                .map((a) => {
                  const delta = growth(history, a.id),
                    rows = history
                      .filter((h) => h.accountId === a.id)
                      .sort((a, b) => a.at.localeCompare(b.at));
                  return (
                    <article key={a.id} className="pro-history">
                      <h3>@{a.username}</h3>
                      <p>
                        {rows.length} mediciones · última:{" "}
                        {when(rows.at(-1)?.at)}
                      </p>
                      {delta ? (
                        <>
                          <strong>
                            {delta.interactionsDelta == null
                              ? "—"
                              : `${delta.interactionsDelta >= 0 ? "+" : ""}${n(delta.interactionsDelta)}`}{" "}
                            interacciones
                          </strong>
                          <p>
                            {delta.commonPosts} publicaciones comunes ·{" "}
                            {n(delta.hours)} horas entre mediciones
                          </p>
                          <p>
                            Seguidores:{" "}
                            {delta.followersDelta == null
                              ? "—"
                              : `${delta.followersDelta >= 0 ? "+" : ""}${n(delta.followersDelta)}`}
                          </p>
                        </>
                      ) : (
                        <p>
                          Necesitamos dos días de mediciones, separados al menos
                          6 horas, para calcular cambios.
                        </p>
                      )}
                      <div
                        className="pro-spark"
                        aria-label="Histórico de seguidores"
                      >
                        {rows.slice(-14).map((r) => {
                          const vals = rows
                              .slice(-14)
                              .map((x) => x.followers)
                              .filter(Number.isFinite),
                            min = Math.min(...vals),
                            max = Math.max(...vals);
                          return (
                            <i
                              key={r.at}
                              title={`${when(r.at)}: ${n(r.followers)} seguidores`}
                              style={{
                                height:
                                  r.followers == null
                                    ? "0%"
                                    : `${max === min ? 50 : 15 + (85 * (r.followers - min)) / (max - min)}%`,
                              }}
                            />
                          );
                        })}
                      </div>
                    </article>
                  );
                })}
            </div>
            {!store.accounts.length && (
              <div className="pro-empty">
                Añade tu primer competidor para empezar a guardar mediciones.
              </div>
            )}
            <div className="pro-automation">
              <div>
                <h3>Seguimiento diario</h3>
                <p>
                  Actualización a las 09:00 UTC, hasta 20 cuentas por espacio.
                  Los espacios se procesan por turnos. Tu autorización se guarda
                  en el servidor mientras esté activo.
                </p>
                <p>
                  {cloud?.automation?.enabled ? "Activado" : "Desactivado"} ·
                  Última ejecución: {when(cloud?.automation?.lastRun)}
                </p>
                {cloud?.automation?.lastError && (
                  <p className="pro-warning">{cloud.automation.lastError}</p>
                )}
                {!capabilities?.automation && (
                  <p>Falta activar la tarea programada en el alojamiento.</p>
                )}
              </div>
              <button
                className="button white"
                disabled={locked || !capabilities?.automation || !cloud}
                onClick={() =>
                  run("automation", async () =>
                    onChange(
                      await request("automation", {
                        enabled: !cloud.automation.enabled,
                      }),
                    ),
                  )
                }
              >
                {cloud?.automation?.enabled
                  ? "Desactivar seguimiento"
                  : "Activar seguimiento diario"}
              </button>
            </div>
          </section>
          <details className="pro-method">
            <summary>Cómo interpretar este análisis</summary>
            <p>
              Franjas de antigüedad: 2–7, 8–30 y más de 30 días. Usamos likes +
              comentarios completos y la mediana de otras publicaciones de la
              misma cuenta y formato. El multiplicador describe esta muestra; no
              prueba una causa ni predice resultados. Las publicaciones muy
              antiguas pueden haber acumulado más interacciones dentro de su
              franja. El histórico empieza cuando sincronizas y no reconstruye
              cifras pasadas. La ausencia de una métrica se representa como
              desconocida.
            </p>
          </details>
        </>
      )}
      {page === "studio" && (
        <>
          <div className="pro-banner">
            <div>
              <span className="eyebrow">TU CRITERIO. MÁS CONTEXTO.</span>
              <h2>De una referencia a un guion propio.</h2>
              <p>
                Define para quién creas. La IA redacta borradores con
                referencias que puedes revisar y convertir en experimentos.
              </p>
            </div>
            <Sparkles size={38} />
          </div>
          <section className="pro-panel">
            <h2>Tu dirección editorial</h2>
            <div className="pro-form-grid">
              <label className="field">
                Tu audiencia
                <textarea
                  rows={2}
                  maxLength={300}
                  value={profile.audience}
                  onChange={(e) =>
                    setProfile({ ...profile, audience: e.target.value })
                  }
                />
              </label>
              <label className="field">
                Objetivo
                <textarea
                  rows={2}
                  maxLength={300}
                  value={profile.goal}
                  onChange={(e) =>
                    setProfile({ ...profile, goal: e.target.value })
                  }
                />
              </label>
              <label className="field">
                Tu tono
                <textarea
                  rows={2}
                  maxLength={200}
                  value={profile.tone}
                  onChange={(e) =>
                    setProfile({ ...profile, tone: e.target.value })
                  }
                />
              </label>
            </div>
            <button
              className="button white"
              disabled={locked || !cloud}
              onClick={() => run("profile", saveProfile)}
            >
              Guardar dirección editorial
            </button>
          </section>
          <div className="pro-tabs">
            <button
              className={tab === "briefs" ? "selected" : ""}
              onClick={() => setTab("briefs")}
            >
              Guiones con referencias
            </button>
            <button
              className={tab === "video" ? "selected" : ""}
              onClick={() => setTab("video")}
            >
              Analizar un vídeo
            </button>
          </div>
          {!capabilities?.ai && (
            <div className="notice">
              <Sparkles size={20} />
              <div>
                <strong>IA pendiente de activar</strong>
                <p>
                  Configura OPENAI_API_KEY en las variables privadas de Vercel y
                  vuelve a desplegar. No pegues tu clave en el chat ni en esta
                  página. El proveedor puede cobrar por uso.
                </p>
              </div>
            </div>
          )}
          {capabilities?.ai && (
            <p className="muted">
              {capabilities.usedToday} de {capabilities.dailyLimit} análisis
              usados hoy (UTC). Al generar enviarás las referencias
              seleccionadas, tu dirección editorial o el material del vídeo a
              OpenAI.
            </p>
          )}
          {tab === "briefs" ? (
            <>
              <section className="pro-panel pro-action">
                <div>
                  <h2>Tu próximo reel, con una hipótesis</h2>
                  <p>
                    Seleccionamos hasta 8 referencias comparables de tu espacio
                    real. El borrador incluye guion, tomas, CTA y afirmaciones
                    pendientes de comprobar.
                  </p>
                </div>
                <button
                  className="button primary"
                  disabled={locked || !capabilities?.ai || store.demo}
                  onClick={() =>
                    run("brief", async () => {
                      await request("brief");
                      await onRefresh();
                      setToast("Guion generado con referencias reales.");
                    })
                  }
                >
                  <Sparkles size={17} />
                  {busy === "brief" ? "Generando…" : "Generar guion con IA"}
                </button>
              </section>
              {(cloud?.briefs || []).map((brief) => (
                <article key={brief.id} className="pro-panel pro-brief">
                  <span className="pro-badge">
                    Borrador IA · {when(brief.createdAt)}
                  </span>
                  <h2>{brief.title}</h2>
                  <blockquote>{brief.hook}</blockquote>
                  <h3>Guion</h3>
                  <p className="pro-pre">{brief.script}</p>
                  <h3>Tomas sugeridas</h3>
                  <ol>
                    {brief.shots.map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ol>
                  <p>
                    <strong>Cierre:</strong> {brief.cta}
                  </p>
                  <div className="pro-hypothesis">
                    <strong>Hipótesis a probar</strong>
                    <p>{brief.hypothesis}</p>
                    <p>{brief.reason}</p>
                  </div>
                  <h3>Referencias que puedes comprobar</h3>
                  {brief.sourceIds.map((id) => {
                    const p = ranked.find((p) => p.id === id);
                    return p ? (
                      <Reference
                        key={id}
                        post={p}
                        accounts={store.accounts}
                        onOpen={onOpen}
                      />
                    ) : (
                      <p key={id}>
                        Referencia {id} · ya no está en la muestra actual.
                      </p>
                    );
                  })}
                  {brief.healthChecks.length > 0 && (
                    <details>
                      <summary>Afirmaciones pendientes de verificar</summary>
                      <ul>
                        {brief.healthChecks.map((s, i) => (
                          <li key={i}>{s}</li>
                        ))}
                      </ul>
                    </details>
                  )}
                  <button
                    className="button white"
                    disabled={Boolean(busy)}
                    onClick={() =>
                      onSave({
                        id: `ai-${brief.id}`,
                        sourceId: brief.sourceIds[0],
                        topic: "Propuesta con IA",
                        title: brief.title,
                        hook: brief.hook,
                        structure: brief.shots.join("\n"),
                        reason: brief.reason,
                        notes: `${brief.script}\n\nCTA: ${brief.cta}\n\nHipótesis: ${brief.hypothesis}`,
                        savedAt: new Date().toISOString(),
                      })
                    }
                  >
                    <Bookmark size={16} />
                    Guardar en Mis ideas
                  </button>
                </article>
              ))}
              {!cloud?.briefs?.length && (
                <div className="pro-empty">
                  Tus guiones aparecerán aquí. La IA no se ejecuta hasta que
                  pulses Generar.
                </div>
              )}
            </>
          ) : (
            <>
              <section className="pro-panel">
                <h2>Lee el vídeo más allá de sus likes</h2>
                <p>
                  Sube un vídeo de hasta 3 minutos y 100 MB, o pega una
                  transcripción. Con vídeo extraemos el audio y hasta 3
                  fotogramas; el archivo original permanece en tu dispositivo.
                </p>
                <label className="field">
                  Nombre del análisis
                  <input
                    maxLength={160}
                    value={videoTitle}
                    onChange={(e) => setVideoTitle(e.target.value)}
                    placeholder="Ej.: reel sobre desayunos con proteína"
                  />
                </label>
                <label className="field">
                  Vídeo MP4 o WebM
                  <input
                    type="file"
                    accept="video/mp4,video/webm"
                    disabled={Boolean(busy)}
                    onChange={(e) => setVideo(e.target.files[0] || null)}
                  />
                </label>
                <label className="field">
                  O pega la transcripción
                  <textarea
                    rows={6}
                    maxLength={18000}
                    disabled={Boolean(video)}
                    value={transcript}
                    onChange={(e) => setTranscript(e.target.value)}
                    placeholder="Pega lo que se dice en el vídeo. Con texto no analizamos imágenes."
                  />
                </label>
                {video && (
                  <button
                    className="text-button"
                    disabled={Boolean(busy)}
                    onClick={() => setVideo(null)}
                  >
                    Usar solo transcripción
                  </button>
                )}
                <p className="muted">
                  Al analizar, enviarás el audio y los fotogramas, o la
                  transcripción, a OpenAI. Pulso conserva el resultado y la
                  transcripción; no guarda el vídeo ni el audio.
                </p>
                <div className="pro-actions">
                  <button
                    className="button primary"
                    disabled={
                      locked ||
                      !capabilities?.ai ||
                      (!video && transcript.trim().length < 30)
                    }
                    onClick={() => run("video", videoAnalysis)}
                  >
                    <Film size={17} />
                    {busy === "video"
                      ? video && progress < 100
                        ? `Preparando audio ${progress}%…`
                        : "Analizando…"
                      : "Analizar contenido"}
                  </button>
                  {busy === "video" && video && (
                    <button
                      className="button white"
                      onClick={() => abort.current?.abort()}
                    >
                      Cancelar
                    </button>
                  )}
                </div>
              </section>
              {(cloud?.videoAnalyses || []).map((v) => (
                <article className="pro-panel" key={v.id}>
                  <span className="pro-badge">
                    Borrador IA · {v.frameCount} fotogramas ·{" "}
                    {when(v.createdAt)}
                  </span>
                  <h2>{v.title}</h2>
                  <h3>Gancho</h3>
                  <p>{v.hook}</p>
                  {[
                    ["Estructura", v.structure],
                    ["Texto observado en pantalla", v.screenText],
                    ["Evidencias del contenido", v.evidence],
                    ["Mejoras para probar", v.improvements],
                    ["Límites de este análisis", v.caveats],
                  ].map(
                    ([label, values]) =>
                      values.length > 0 && (
                        <div key={label}>
                          <h3>{label}</h3>
                          <ul>
                            {values.map((s, i) => (
                              <li key={i}>{s}</li>
                            ))}
                          </ul>
                        </div>
                      ),
                  )}
                  <h3>Adaptación propuesta</h3>
                  <p className="pro-pre">{v.adaptedScript}</p>
                  <details>
                    <summary>Ver transcripción</summary>
                    <p className="pro-pre">{v.transcript}</p>
                  </details>
                </article>
              ))}
            </>
          )}
        </>
      )}
      {page === "performance" && (
        <>
          <div className="pro-banner">
            <div>
              <span className="eyebrow">CIERRA EL CICLO</span>
              <h2>Aprende de lo que tú publicas.</h2>
              <p>
                Asocia tus ideas a publicaciones reales y observa cómo rinden
                frente a tu contenido habitual.
              </p>
            </div>
            <button
              className="button white"
              disabled={locked}
              onClick={() =>
                run("own", async () => {
                  await request("own");
                  await onRefresh();
                  setToast("Tus estadísticas se han actualizado.");
                })
              }
            >
              <RefreshCw size={16} />
              {busy === "own" ? "Actualizando…" : "Actualizar mis resultados"}
            </button>
          </div>
          {own ? (
            <>
              <section className="pro-panel">
                <h2>@{own.account.username}</h2>
                <p className="muted">
                  Última actualización: {when(own.updatedAt)} · muestra de hasta
                  50 publicaciones recientes.
                </p>
                <div className="pro-metrics">
                  <div>
                    <strong>{n(own.account.followers)}</strong>
                    <span>Seguidores actuales</span>
                  </div>
                  {own.metrics.map((m) => (
                    <div key={m.name}>
                      <strong>
                        {m.available ? n(m.value) : "No disponible"}
                      </strong>
                      <span>
                        {m.name === "reach"
                          ? "Alcance"
                          : "Cuentas que interactuaron"}{" "}
                        · últimos {own.periodDays} días
                      </span>
                    </div>
                  ))}
                </div>
                <p className="muted">
                  Las métricas no concedidas por Meta aparecen como no
                  disponibles. Los likes y comentarios públicos se muestran
                  aunque los insights no estén disponibles. Consultamos insights
                  de hasta 8 publicaciones, priorizando las vinculadas a tus
                  ideas; su disponibilidad depende del formato y los permisos.
                </p>
              </section>
              <section className="pro-panel">
                <h2>Vincula tus ideas publicadas</h2>
                <p>
                  Guarda una idea y elige la publicación donde la probaste. La
                  IA podrá usar estos resultados al generar nuevos guiones.
                </p>
                {store.savedIdeas.map((i) => (
                  <label className="pro-link-idea" key={i.id}>
                    <strong>{i.title}</strong>
                    <select
                      aria-label={`Publicación para ${i.title}`}
                      disabled={locked || !cloud}
                      value={i.publishedPostId || ""}
                      onChange={(e) =>
                        run("link", async () => {
                          const savedIdeas = store.savedIdeas.map((x) =>
                            x.id === i.id
                              ? { ...x, publishedPostId: e.target.value }
                              : x,
                          );
                          onChange(
                            await request("workspace", {
                              revision: cloud.revision,
                              savedIdeas,
                            }),
                          );
                        })
                      }
                    >
                      <option value="">Sin vincular</option>
                      {own.posts.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.caption.slice(0, 90)}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
                {!store.savedIdeas.length && (
                  <div className="pro-empty">
                    Guarda primero una propuesta en Mis ideas o en el Estudio
                    creativo.
                  </div>
                )}
              </section>
              <section className="pro-panel">
                <h2>Resultados de tus experimentos</h2>
                {learning(own.posts, store.savedIdeas).map(({ idea, post }) => (
                  <article className="pro-experiment" key={idea.id}>
                    <h3>{idea.title}</h3>
                    <strong>
                      {post.multiplier == null
                        ? "Aún sin muestra comparable"
                        : `${n(post.multiplier)}× tu mediana comparable`}
                    </strong>
                    <p>
                      {n(interactions(post))} interacciones públicas ·{" "}
                      {post.peerCount} referencias comparables
                    </p>
                    <div className="pro-owned-metrics">
                      {(
                        own.perPostInsights?.find((x) => x.postId === post.id)
                          ?.metrics || []
                      ).map((m) => (
                        <span key={m.name}>
                          <strong>{m.available ? n(m.value) : "—"}</strong>{" "}
                          {
                            {
                              views: "Visualizaciones",
                              saved: "Guardados",
                              shares: "Compartidos",
                              total_interactions: "Interacciones totales",
                            }[m.name]
                          }
                        </span>
                      ))}
                    </div>
                    {safeInstagramUrl(post.url) && (
                      <a href={post.url} target="_blank" rel="noreferrer">
                        Ver publicación <ExternalLink size={13} />
                      </a>
                    )}
                  </article>
                ))}
                {!learning(own.posts, store.savedIdeas).length && (
                  <div className="pro-empty">
                    Cuando vincules una idea, su resultado aparecerá aquí. Una
                    sola publicación no permite atribuir el rendimiento a una
                    causa.
                  </div>
                )}
              </section>
            </>
          ) : (
            <section className="pro-panel pro-empty">
              <TrendingUp size={30} />
              <h2>Tus resultados, en contexto</h2>
              <p>
                Pulsa Actualizar mis resultados para consultar tu cuenta
                conectada. Después podrás vincular ideas a publicaciones.
              </p>
            </section>
          )}
        </>
      )}
      {busy && (
        <div className="pro-busy" role="status">
          <RefreshCw size={16} className="spin" />
          {busy === "video" && progress < 100 && video
            ? `Extrayendo audio: ${progress}% (se reproduce a velocidad normal)`
            : "Procesando…"}
        </div>
      )}
    </div>
  );
}
