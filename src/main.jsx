import React, { useEffect, useId, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Activity,
  Camera,
  TrendingUp,
  LayoutDashboard,
  Layers3,
  Lightbulb,
  Users,
  Instagram,
  ArrowUpRight,
  ArrowRight,
  Plus,
  Search,
  ChevronDown,
  X,
  Heart,
  MessageCircle,
  Play,
  Bookmark,
  Check,
  Link2,
  RefreshCw,
  Download,
  Trash2,
  ShieldCheck,
  Settings2,
  Menu,
  LogOut,
  AlertCircle,
  Leaf,
  Dumbbell,
  Utensils,
  Sparkles,
  ExternalLink,
  SlidersHorizontal,
} from "lucide-react";
import {
  demoStore,
  emptyStore,
  engagement,
  filterPosts,
  buildIdeas,
  mergeDiscovery,
  normalizeDiscovery,
  safeInstagramUrl,
} from "./model.js";
import "./styles.css";
import Pro from "./Pro.jsx";
import CameraPage from "./Camera.jsx";

const KEY = "pulso-workspace-v1";
const number = (value) => new Intl.NumberFormat("es-ES").format(value);
const compact = (value) =>
  new Intl.NumberFormat("es-ES", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
const percent = (value) =>
  value == null
    ? "—"
    : `${value.toLocaleString("es-ES", { maximumFractionDigits: 2 })}%`;
const date = (value) =>
  new Date(value).toLocaleDateString("es-ES", {
    day: "numeric",
    month: "short",
  });
const formats = {
  reel: "Reel",
  carousel: "Carrusel",
  image: "Imagen",
  video: "Vídeo",
};
const navItems = [
  { id: "overview", label: "Panorama", icon: LayoutDashboard },
  { id: "library", label: "Biblioteca de contenido", icon: Layers3 },
  { id: "ideas", label: "Mis ideas", icon: Lightbulb },
  { id: "competitors", label: "Competidores", icon: Users },
  { id: "analysis", label: "Análisis avanzado", icon: Activity },
  { id: "studio", label: "Estudio creativo", icon: Sparkles },
  { id: "performance", label: "Mi rendimiento", icon: TrendingUp },
  { id: "camera", label: "Monitor de cámara", icon: Camera },
];

function readBackup() {
  try {
    return localStorage.getItem("pulso-before-cloud-v1");
  } catch {
    return null;
  }
}

function readStore() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { store: demoStore(), error: "" };
    const parsed = JSON.parse(raw);
    if (
      parsed.version !== 1 ||
      !Array.isArray(parsed.accounts) ||
      !Array.isArray(parsed.posts) ||
      !Array.isArray(parsed.savedIdeas)
    )
      throw new Error();
    return { store: parsed, error: "" };
  } catch {
    return {
      store: emptyStore(),
      error:
        "No se pudieron leer los datos guardados. No se sobrescribirán. Exporta una copia o revisa el almacenamiento del navegador.",
    };
  }
}

async function api(path, options = {}) {
  let res;
  try {
    res = await fetch(`/api/instagram/${path}`, {
      credentials: "same-origin",
      ...options,
    });
  } catch {
    throw new Error(
      "No se pudo conectar con el servidor. Comprueba que Pulso esté ejecutándose.",
    );
  }
  let body;
  try {
    body = await res.json();
  } catch {
    throw new Error(
      "El servidor no respondió correctamente. Inténtalo de nuevo.",
    );
  }
  if (!res.ok)
    throw new Error(body.error || "No se pudo completar la operación.");
  return body;
}

function Modal({ title, children, onClose, wide = false }) {
  const dialog = useRef(null);
  const titleId = useId();
  useEffect(() => {
    const previous = document.activeElement;
    dialog.current.showModal();
    return () => {
      previous?.focus();
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      aria-labelledby={titleId}
      className={`modal ${wide ? "wide" : ""}`}
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === dialog.current) onClose();
      }}
    >
      <div className="modal-heading">
        <div>
          <span className="eyebrow">PULSO · TU RADAR DE CONTENIDO</span>
          <h2 id={titleId}>{title}</h2>
        </div>
        <button
          className="icon-button"
          aria-label="Cerrar ventana"
          onClick={onClose}
        >
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}

function Artwork({ post, large = false }) {
  const index = [
    "Proteínas y suplementos",
    "Entrenamiento",
    "Recetas y alimentación",
    "Mitos y educación",
    "Hábitos saludables",
  ].indexOf(post.topic);
  const titles = [
    "PROTEÍNA,\nSIN COMPLICARTE.",
    "TU FUERZA.\nA TU RITMO.",
    "COMER BIEN.\nVIVIR MEJOR.",
    "MENOS MITOS.\nMÁS CONTEXTO.",
    "PEQUEÑOS\nHÁBITOS.",
  ];
  return (
    <div
      className={`artwork art-${index < 0 ? 0 : index} ${large ? "large" : ""}`}
    >
      <div className="cover-grid" />
      <span className="format-pill">
        {post.format === "reel" || post.format === "video" ? (
          <Play size={11} fill="currentColor" />
        ) : (
          <Layers3 size={12} />
        )}
        {formats[post.format]}
      </span>
      <span className="cover-editorial">NUTRICIÓN & MOVIMIENTO</span>
      <div className="cover-shape">
        {index === 1 ? (
          <Dumbbell strokeWidth={1.2} />
        ) : index === 2 ? (
          <Utensils strokeWidth={1.2} />
        ) : (
          <Leaf strokeWidth={1.2} />
        )}
      </div>
      <strong>
        {titles[index < 0 ? 0 : index].split("\n").map((line, i) => (
          <React.Fragment key={line}>
            {i > 0 && <br />}
            {line}
          </React.Fragment>
        ))}
      </strong>
      <span className="cover-caption">
        {post.id.startsWith("sample-")
          ? "EJEMPLO ILUSTRATIVO"
          : "PORTADA GENERADA POR PULSO"}
      </span>
      <span className="cover-arrow">
        <ArrowUpRight size={17} />
      </span>
    </div>
  );
}

function PostCard({ post, account, onOpen }) {
  return (
    <button className="post-card" onClick={() => onOpen(post)}>
      <Artwork post={post} />
      <div className="post-body">
        <div className="post-account">
          <span className={`avatar tone-${(account?.name.length || 0) % 3}`}>
            {account?.name?.slice(0, 1) || "?"}
          </span>
          <span>@{account?.username || "cuenta"}</span>
          <span className="post-date">{date(post.date)}</span>
        </div>
        <p className="post-caption">{post.caption}</p>
        <span className="topic-tag">{post.topic}</span>
        <div className="post-metrics">
          <span
            title={
              post.likesAvailable === false
                ? "Likes no disponibles"
                : "Me gusta"
            }
          >
            <Heart size={14} />
            {post.likesAvailable === false ? "—" : compact(post.likes)}
          </span>
          <span title="Comentarios">
            <MessageCircle size={14} />
            {post.commentsAvailable === false ? "—" : compact(post.comments)}
          </span>
          <span
            className="post-rate"
            title="(Likes + comentarios) / seguidores actuales × 100"
          >
            {percent(engagement(post, account))}
            <ArrowUpRight size={13} />
          </span>
        </div>
      </div>
    </button>
  );
}

function Chart({ posts, days }) {
  const span =
    Number(days) ||
    Math.max(
      30,
      ...posts.map((p) =>
        Math.ceil((Date.now() - new Date(p.date)) / 86400000),
      ),
    );
  const points = Array.from({ length: 7 }, (_, i) => {
    const end = Date.now() - (6 - i) * (span / 7) * 86400000;
    const start = end - (span / 7) * 86400000;
    return {
      total: posts
        .filter((p) => +new Date(p.date) > start && +new Date(p.date) <= end)
        .reduce((n, p) => n + p.likes + p.comments, 0),
      date: new Date(end),
    };
  });
  const max = Math.max(...points.map((p) => p.total), 1);
  return (
    <div className="chart-wrap">
      <div className="chart-y">
        <span>{compact(max)}</span>
        <span>{compact(max / 2)}</span>
        <span>0</span>
      </div>
      <div className="chart-content">
        <div className="chart-lines">
          <i />
          <i />
          <i />
        </div>
        <div className="bars">
          {points.map((p, i) => (
            <div className="bar-column" key={i}>
              <div
                className="bar"
                style={{
                  height: `${(p.total / max) * 100}%`,
                  minHeight: p.total ? 6 : 0,
                }}
              >
                <span>{number(p.total)}</span>
              </div>
              <small>
                {p.date.toLocaleDateString("es-ES", {
                  day: "numeric",
                  month: "short",
                })}
              </small>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function App() {
  const [initial] = useState(readStore);
  const [store, setStore] = useState(initial.store);
  const [storageError, setStorageError] = useState(initial.error);
  const [page, setPage] = useState("overview");
  const [modal, setModal] = useState(null);
  const [selectedPost, setSelectedPost] = useState(null);
  const [connection, setConnection] = useState({
    configured: false,
    connected: false,
    accounts: [],
    loading: true,
  });
  const [connectionError, setConnectionError] = useState("");
  const [toast, setToast] = useState("");
  const [account, setAccount] = useState("all");
  const [format, setFormat] = useState("all");
  const [days, setDays] = useState("30");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("interactions");
  const [username, setUsername] = useState("");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");
  const [ideaTab, setIdeaTab] = useState("suggested");
  const [mobileNav, setMobileNav] = useState(false);
  const [removeId, setRemoveId] = useState(null);
  const [editIdea, setEditIdea] = useState(null);
  const [cloud, setCloud] = useState(null);
  const [capabilities, setCapabilities] = useState(null);
  const [cloudError, setCloudError] = useState("");
  const cloudRef = useRef(null);
  const activeOwner = useRef(null);
  function applyCloud(data, owner = activeOwner.current) {
    if (!owner || owner !== activeOwner.current) return;
    cloudRef.current = data;
    setCloud(data);
    setStore((s) => ({
      ...s,
      version: 1,
      demo: false,
      ownerId: owner,
      accounts: data.accounts,
      posts: data.posts,
      savedIdeas: data.savedIdeas,
    }));
    setCloudError("");
  }
  async function refreshCloud() {
    const owner = activeOwner.current;
    const [data, caps] = await Promise.all([
      api("pro/workspace"),
      api("pro/capabilities"),
    ]);
    if (owner !== activeOwner.current) return;
    applyCloud(data, owner);
    setCapabilities(caps);
  }
  useEffect(() => {
    activeOwner.current = connection.connected ? connection.selected : null;
    cloudRef.current = null;
    setCloud(null);
    setCapabilities(null);
    setCloudError("");
    if (!connection.connected || !connection.selected) return;
    let cancelled = false;
    const owner = connection.selected;
    (async () => {
      try {
        let [data, caps] = await Promise.all([
          api("pro/workspace"),
          api("pro/capabilities"),
        ]);
        if (cancelled) return;
        setCapabilities(caps);
        // Preserve existing local work on the first migration; never mix two known owners.
        const sameOwner = !store.ownerId || store.ownerId === owner;
        const localIdeas = sameOwner ? store.savedIdeas : [];
        let migrationFailed = [];
        const legacy =
          sameOwner &&
          !store.demo &&
          store.accounts.length &&
          !data.accounts.length;
        if (legacy) {
          localStorage.setItem("pulso-before-cloud-v1", JSON.stringify(store));
          setCloudError(
            "Guardando tus cuentas anteriores en el servidor y verificándolas con Meta…",
          );
          for (
            let offset = 0;
            offset < Math.min(20, store.accounts.length) && !cancelled;
            offset += 3
          ) {
            const imported = await api("pro/import", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "X-CSRF-Token": connection.csrf,
              },
              body: JSON.stringify({
                usernames: store.accounts
                  .slice(offset, offset + 3)
                  .map((a) => a.username),
              }),
            });
            data = imported.workspace;
            migrationFailed.push(...imported.failed);
          }
        }
        if (cancelled) return;
        if (!data.savedIdeas.length && localIdeas.length) {
          data = await api("pro/workspace", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-CSRF-Token": connection.csrf,
            },
            body: JSON.stringify({
              revision: data.revision,
              savedIdeas: localIdeas,
            }),
          });
          if (cancelled) return;
        }
        if (data.accounts.length || !sameOwner || !store.demo)
          applyCloud(data, owner);
        else {
          cloudRef.current = data;
          setCloud(data);
        }
        if (migrationFailed.length)
          setCloudError(
            `No se pudieron verificar ${migrationFailed.length} cuentas anteriores con Meta. Conservamos una copia local completa; puedes exportarla en Datos y ajustes y volver a añadir esas cuentas.`,
          );
      } catch (e) {
        if (!cancelled) setCloudError(e.message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [connection.connected, connection.selected]);
  async function persistIdeas(savedIdeas) {
    if (connection.connected && !cloudRef.current)
      throw new Error(
        "Espera a que se cargue tu espacio o recarga la página antes de guardar.",
      );
    if (connection.connected && !store.demo) {
      const data = await postRequest("pro/workspace", {
        revision: cloudRef.current.revision,
        savedIdeas,
      });
      cloudRef.current = data;
      setCloud(data);
    }
    setStore((s) => ({ ...s, savedIdeas }));
  }
  async function saveEditorialIdea(idea) {
    try {
      await persistIdeas([
        ...store.savedIdeas.filter((i) => i.id !== idea.id),
        idea,
      ]);
      setToast("Idea guardada en tu libreta.");
    } catch (e) {
      setCloudError(e.message);
    }
  }

  useEffect(() => {
    if (initial.error) return;
    try {
      localStorage.setItem(KEY, JSON.stringify(store));
      setStorageError("");
    } catch {
      setStorageError(
        "El navegador no permite guardar los datos. Exporta tu trabajo antes de salir.",
      );
    }
  }, [store, initial.error]);
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(""), 5000);
      return () => clearTimeout(timer);
    }
  }, [toast]);
  useEffect(() => {
    refreshConnection();
    const result = new URLSearchParams(window.location.search).get(
      "connection",
    );
    const messages = {
      success:
        "Instagram conectado. Ya puedes añadir competidores profesionales.",
      cancelled: "Has cancelado la conexión con Instagram.",
      "invalid-state": "El intento de conexión caducó. Vuelve a intentarlo.",
      "no-pages":
        "Meta no devolvió ninguna página a Pulso. En Facebook, revisa Integraciones comerciales → Pulso → Ver y editar y concede acceso a la nueva Página. Después vuelve a conectar.",
      "missing-permissions":
        "Meta no concedió todos los permisos necesarios. Vuelve a conectar y revisa los permisos y la selección de tu Página e Instagram en la autorización de Pulso.",
      "instagram-lookup-failed":
        "Meta confirmó el acceso a tu cuenta de Instagram, pero su API no permitió verificar el perfil profesional. Revisaremos ese acceso; la selección de la cuenta ya está concedida.",
      "grant-inspection-failed":
        "Meta completó la autorización, pero Pulso no pudo verificar los activos concedidos. Necesitamos revisar la respuesta de la API; no hace falta cambiar tu Página.",
      "page-lookup-failed":
        "Meta devolvió páginas, pero no permitió completar la consulta de su vínculo con Instagram. El vínculo no se ha podido verificar; revisaremos el acceso de la app.",
      "page-lookup-incomplete":
        "La autorización incluye más activos de los que podemos comprobar en este intento. Limita la selección a tu Página e Instagram para verificarlos.",
      "no-linked-instagram":
        "Meta devolvió páginas, pero ninguna con un Instagram profesional accesible para Pulso. Revisa que la nueva Página y su Instagram estén incluidos en la autorización de Pulso.",
      "no-professional-account":
        "No se encontró una cuenta profesional de Instagram vinculada a una página de Facebook que administres.",
      failed:
        "No se pudo completar la conexión. Revisa los permisos y la configuración de Meta.",
    };
    if (result) {
      setToast(messages[result] || "Conexión finalizada.");
      if (
        [
          "no-pages",
          "missing-permissions",
          "no-linked-instagram",
          "page-lookup-failed",
          "page-lookup-incomplete",
          "grant-inspection-failed",
          "instagram-lookup-failed",
          "no-professional-account",
          "failed",
        ].includes(result)
      ) {
        setFormError(messages[result]);
        setModal("connection");
      }
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, []);

  async function refreshConnection() {
    try {
      const status = await api("status");
      setConnection({ ...status, loading: false });
      setConnectionError("");
    } catch (e) {
      setConnectionError(e.message);
      setConnection((s) => ({ ...s, loading: false }));
    }
  }
  function postRequest(path, body = {}) {
    return api(path, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": connection.csrf || "",
      },
      body: JSON.stringify(body),
    });
  }
  function openConnection() {
    setFormError("");
    setModal("connection");
    refreshConnection();
  }
  function openAdd() {
    setUsername("");
    setFormError("");
    setModal(connection.connected ? "add" : "connection");
  }
  function openPost(p) {
    setSelectedPost(p);
    setModal("post");
  }
  function navigate(id) {
    setPage(id);
    setMobileNav(false);
  }
  async function sync(handle) {
    setBusy(true);
    setFormError("");
    try {
      const raw = await postRequest("discover", { username: handle });
      const result = normalizeDiscovery(raw);
      if (raw.workspace) applyCloud(raw.workspace);
      else
        setStore((s) =>
          mergeDiscovery(
            s.demo ? { ...emptyStore(), savedIdeas: s.savedIdeas } : s,
            result,
          ),
        );
      setAccount("all");
      setModal(null);
      setPage("competitors");
      setToast(
        `@${result.account.username}: ${result.posts.length} publicaciones sincronizadas${result.hasMore ? " (muestra de las últimas 50)" : ""}.`,
      );
    } catch (e) {
      setFormError(e.message);
    } finally {
      setBusy(false);
    }
  }
  function download() {
    const blob = new Blob(
      [
        JSON.stringify(
          {
            ...store,
            analysis: cloud
              ? {
                  history: cloud.history,
                  profile: cloud.profile,
                  briefs: cloud.briefs,
                  videoAnalyses: cloud.videoAnalyses,
                  own: cloud.own,
                }
              : null,
            exportedAt: new Date().toISOString(),
          },
          null,
          2,
        ),
      ],
      { type: "application/json" },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `pulso-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setToast("Copia de tus datos exportada.");
  }
  async function saveIdea(idea) {
    try {
      const savedIdeas = store.savedIdeas.some((i) => i.id === idea.id)
        ? store.savedIdeas.filter((i) => i.id !== idea.id)
        : [
            ...store.savedIdeas,
            { ...idea, notes: "", savedAt: new Date().toISOString() },
          ];
      await persistIdeas(savedIdeas);
    } catch (e) {
      setCloudError(e.message);
    }
  }

  const filtered = filterPosts(store.posts, {
    account,
    format,
    search,
    days: Number(days),
  });
  const sorted = [...filtered].sort((a, b) =>
    sort === "recent"
      ? new Date(b.date) - new Date(a.date)
      : sort === "rate"
        ? (engagement(
            b,
            store.accounts.find((x) => x.id === b.accountId),
          ) ?? -1) -
          (engagement(
            a,
            store.accounts.find((x) => x.id === a.accountId),
          ) ?? -1)
        : b.likes + b.comments - (a.likes + a.comments),
  );
  const interactions = filtered.reduce((n, p) => n + p.likes + p.comments, 0);
  const rates = filtered
    .map((p) =>
      engagement(
        p,
        store.accounts.find((a) => a.id === p.accountId),
      ),
    )
    .filter((x) => x != null);
  const avgRate = rates.length
    ? rates.reduce((a, b) => a + b, 0) / rates.length
    : null;
  const best = [...filtered].sort(
    (a, b) =>
      (engagement(
        b,
        store.accounts.find((x) => x.id === b.accountId),
      ) ?? -1) -
      (engagement(
        a,
        store.accounts.find((x) => x.id === a.accountId),
      ) ?? -1),
  )[0];
  const ideas = buildIdeas(filtered, store.accounts);
  const shownIdeas = ideaTab === "saved" ? store.savedIdeas : ideas;
  const currentNav = navItems.find((n) => n.id === page);
  const topTopic = best?.topic;

  return (
    <div className="app-shell">
      {mobileNav && (
        <button
          className="nav-scrim"
          aria-label="Cerrar menú"
          onClick={() => setMobileNav(false)}
        />
      )}
      <aside className={`sidebar ${mobileNav ? "is-open" : ""}`}>
        <a
          href="#"
          className="brand"
          onClick={(e) => {
            e.preventDefault();
            navigate("overview");
          }}
        >
          <span className="brand-mark">
            <Activity size={25} />
          </span>
          pulso<span className="brand-dot">.</span>
        </a>
        <div className="workspace-label">TU ESPACIO DE TRABAJO</div>
        <div className="workspace">
          <span className="workspace-icon">
            <Leaf size={20} />
          </span>
          <div>
            <strong>Nutrición & fitness</strong>
            <span>Estudio de contenido</span>
          </div>
          <ChevronDown size={15} />
        </div>
        <nav aria-label="Navegación principal">
          {navItems.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              className={`nav-item ${page === id ? "active" : ""}`}
              onClick={() => navigate(id)}
            >
              <Icon size={19} />
              <span>{label}</span>
              {id === "ideas" && store.savedIdeas.length > 0 && (
                <small>{store.savedIdeas.length}</small>
              )}
              {page === id && <span className="active-dot" />}
            </button>
          ))}
        </nav>
        <div className="sidebar-note">
          <span className="little-spark">
            <Sparkles size={17} />
          </span>
          <strong>
            Encuentra tu próximo
            <br />
            “esto lo tengo que contar”.
          </strong>
          <p>
            Observa patrones.
            <br />
            Crea con tu propia voz.
          </p>
          <button onClick={() => navigate("ideas")}>
            Explorar ideas <ArrowUpRight size={15} />
          </button>
          <span className="note-orbit" />
        </div>
        <div className="sidebar-bottom">
          <button
            className="nav-item"
            onClick={() => {
              setFormError("");
              setModal("settings");
            }}
          >
            <Settings2 size={18} />
            Datos y ajustes
          </button>
          <div className="profile">
            <div className="profile-avatar">TU</div>
            <div>
              <strong>Mi estudio</strong>
              <span>Una estrategia muy tuya</span>
            </div>
            <span className="status-dot" />
          </div>
        </div>
      </aside>

      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-button mobile-menu"
              aria-label="Abrir menú"
              onClick={() => setMobileNav(true)}
            >
              <Menu size={21} />
            </button>
            <span>Tu espacio</span>
            <span className="slash">/</span>
            <strong>{currentNav.label}</strong>
          </div>
          <div
            className="top-actions"
            style={page === "camera" ? { display: "none" } : undefined}
          >
            <span className={`connection-state ${store.demo ? "demo" : ""}`}>
              <i />
              {store.demo
                ? "Datos de ejemplo"
                : connection.connected
                  ? "Instagram conectado"
                  : "Sin conexión"}
            </span>
            <button className="button small white" onClick={openConnection}>
              <Instagram size={16} />
              <span>
                {connection.connected ? "Mi conexión" : "Conectar Instagram"}
              </span>
            </button>
          </div>
        </header>
        <main>
          {storageError && (
            <div className="notice error">
              <AlertCircle size={17} />
              {storageError}
            </div>
          )}
          {connectionError && page !== "camera" && (
            <div className="notice error">
              <AlertCircle size={17} />
              {connectionError}
              <button onClick={refreshConnection}>Reintentar</button>
            </div>
          )}
          {store.demo && page !== "camera" && (
            <div className="demo-banner">
              <span>
                <span className="demo-dot" /> Estás explorando una muestra. Las
                cuentas y métricas son ficticias.
              </span>
              <button onClick={openConnection}>
                Conecta tus datos <ArrowRight size={14} />
              </button>
            </div>
          )}
          <div
            className="page-heading"
            style={page === "camera" ? { display: "none" } : undefined}
          >
            <div>
              <span className="eyebrow">
                {page === "overview"
                  ? "OBSERVA. ENTIENDE. CREA."
                  : "TU ESTRATEGIA, CON INTENCIÓN."}
              </span>
              <h1>
                {page === "overview"
                  ? "Tu radar de contenido"
                  : page === "library"
                    ? "Contenido que merece una mirada"
                    : page === "ideas"
                      ? "De la inspiración a tu próxima idea"
                      : page === "analysis"
                        ? "Tu ventaja, con datos"
                        : page === "studio"
                          ? "Tu estudio creativo"
                          : page === "performance"
                            ? "Tus ideas, tus resultados"
                            : "Un ojo en tu sector"}
              </h1>
              <p>
                {page === "overview"
                  ? "Descubre qué conecta en tu nicho y encuentra tu siguiente buena idea."
                  : page === "library"
                    ? "Reels, carruseles y publicaciones. Las referencias, en un solo lugar."
                    : page === "ideas"
                      ? "Encuentra un ángulo propio. Inspírate en patrones, no copies contenido."
                      : page === "analysis"
                        ? "Referencias comparables, patrones e historial de tu nicho."
                        : page === "studio"
                          ? "Guiones con referencias y análisis del contenido de tus vídeos."
                          : page === "performance"
                            ? "Relaciona lo que publicas con los resultados de tu cuenta."
                            : "Sigue a creadores de nutrición y fitness y entiende qué les funciona."}
              </p>
            </div>
            <div className="heading-actions">
              {page === "competitors" ? (
                <button className="button primary" onClick={openAdd}>
                  <Plus size={17} />
                  Añadir competidor
                </button>
              ) : (
                <>
                  {!["analysis", "studio", "performance"].includes(page) && (
                    <label className="select-wrap date-select">
                      <select
                        aria-label="Periodo"
                        value={days}
                        onChange={(e) => setDays(e.target.value)}
                      >
                        <option value="30">Últimos 30 días</option>
                        <option value="90">Últimos 90 días</option>
                        <option value="0">Todo el historial</option>
                      </select>
                      <ChevronDown size={14} />
                    </label>
                  )}
                  <button
                    className="button white icon-only"
                    title="Exportar datos"
                    aria-label="Exportar datos"
                    onClick={download}
                  >
                    <Download size={17} />
                  </button>
                </>
              )}
            </div>
          </div>

          {page === "camera" && <CameraPage />}
          {cloudError && page !== "camera" && (
            <div className="notice error" role="alert">
              {cloudError}{" "}
              <button
                className="text-button"
                onClick={() =>
                  refreshCloud().catch((e) => setCloudError(e.message))
                }
              >
                Recargar espacio
              </button>
            </div>
          )}
          {["analysis", "studio", "performance"].includes(page) && (
            <Pro
              page={page}
              store={store}
              cloud={cloud}
              connection={connection}
              capabilities={capabilities}
              onRefresh={refreshCloud}
              onChange={applyCloud}
              onOpen={openPost}
              onSave={saveEditorialIdea}
              postRequest={postRequest}
              setToast={setToast}
            />
          )}
          {page === "overview" && (
            <>
              <div className="stats-grid">
                {[
                  {
                    label: "Competidores",
                    value: store.accounts.length,
                    icon: Users,
                    foot: "Cuentas en tu radar",
                    cls: "sage",
                  },
                  {
                    label: "Contenido analizado",
                    value: filtered.length,
                    icon: Layers3,
                    foot: `${filtered.filter((p) => p.format === "reel").length} reels en el periodo`,
                    cls: "peach",
                  },
                  {
                    label: "Interacciones públicas",
                    value: number(interactions),
                    icon: Heart,
                    foot: "Likes + comentarios disponibles",
                    cls: "lavender",
                  },
                  {
                    label: "Interacción / seguidores",
                    value: percent(avgRate),
                    icon: Activity,
                    foot: "Media por publicación · muestra",
                    cls: "butter",
                  },
                ].map((stat) => (
                  <div className="stat-card" key={stat.label}>
                    <div className="stat-top">
                      <span>{stat.label}</span>
                      <span className={`stat-icon ${stat.cls}`}>
                        <stat.icon size={17} />
                      </span>
                    </div>
                    <strong className="stat-value">{stat.value}</strong>
                    <span className="stat-foot">{stat.foot}</span>
                  </div>
                ))}
              </div>
              <div className="insights-grid">
                <section className="panel chart-panel">
                  <div className="section-heading">
                    <div>
                      <h2>El pulso de tu nicho</h2>
                      <p>Interacciones en las publicaciones de tu muestra</p>
                    </div>
                    <span className="chart-legend">
                      <i />
                      Likes + comentarios disponibles
                    </span>
                  </div>
                  <Chart posts={filtered} days={days} />
                </section>
                <section className="insight-card">
                  <div className="insight-top">
                    <span className="insight-icon">
                      <Sparkles size={19} />
                    </span>
                    <span className="eyebrow">UNA PISTA PARA CREAR</span>
                    <span className="small-pill">Patrón</span>
                  </div>
                  <h2>
                    {topTopic
                      ? `${topTopic}: un tema para mirar de cerca.`
                      : "Tu próxima buena idea empieza aquí."}
                  </h2>
                  <p>
                    {best ? (
                      <>
                        La publicación con mayor proporción de interacciones en
                        esta muestra trata sobre{" "}
                        <strong>{topTopic.toLowerCase()}</strong>.
                      </>
                    ) : (
                      "Conecta Instagram y añade cuentas profesionales para descubrir referencias de tu nicho."
                    )}
                  </p>
                  <div className="insight-bottom">
                    {best && (
                      <div>
                        <strong>
                          {percent(
                            engagement(
                              best,
                              store.accounts.find(
                                (a) => a.id === best.accountId,
                              ),
                            ),
                          )}
                        </strong>
                        <span>interacciones / seguidores</span>
                      </div>
                    )}
                    <button
                      className="round-button"
                      aria-label="Explorar ideas a partir del contenido"
                      onClick={() => navigate("ideas")}
                    >
                      <ArrowUpRight size={23} />
                    </button>
                  </div>
                </section>
              </div>
            </>
          )}

          {(page === "overview" || page === "library") && (
            <section className="content-section">
              <div className="section-heading content-title">
                <div>
                  <span className="eyebrow">TU BIBLIOTECA DE REFERENCIAS</span>
                  <h2>
                    {page === "overview"
                      ? "Lo que está conectando"
                      : "Todas las publicaciones"}
                  </h2>
                </div>
                {page === "overview" && (
                  <button
                    className="text-button"
                    onClick={() => navigate("library")}
                  >
                    Ver todo el contenido <ArrowRight size={16} />
                  </button>
                )}
              </div>
              <div className="filters">
                <div
                  className="format-tabs"
                  role="group"
                  aria-label="Formato de contenido"
                >
                  {[
                    ["all", "Todo"],
                    ["reel", "Reels"],
                    ["carousel", "Carruseles"],
                    ["image", "Imágenes"],
                    ["video", "Vídeos"],
                  ].map(([id, label]) => (
                    <button
                      className={format === id ? "selected" : ""}
                      key={id}
                      onClick={() => setFormat(id)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <div className="filter-controls">
                  <label className="search-box">
                    <Search size={16} />
                    <input
                      aria-label="Buscar contenido"
                      placeholder="Buscar un tema…"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </label>
                  <label className="select-wrap account-select">
                    <select
                      aria-label="Filtrar por competidor"
                      value={account}
                      onChange={(e) => setAccount(e.target.value)}
                    >
                      <option value="all">Todas las cuentas</option>
                      {store.accounts.map((a) => (
                        <option key={a.id} value={a.id}>
                          @{a.username}
                        </option>
                      ))}
                    </select>
                    <ChevronDown size={14} />
                  </label>
                  <label className="select-wrap sort-select">
                    <SlidersHorizontal size={14} />
                    <select
                      aria-label="Ordenar contenido"
                      value={sort}
                      onChange={(e) => setSort(e.target.value)}
                    >
                      <option value="interactions">Más interacciones</option>
                      <option value="rate">Mayor proporción</option>
                      <option value="recent">Más recientes</option>
                    </select>
                  </label>
                </div>
              </div>
              {sorted.length ? (
                <div className="posts-grid">
                  {sorted
                    .slice(0, page === "overview" ? 3 : sorted.length)
                    .map((post) => (
                      <PostCard
                        key={post.id}
                        post={post}
                        account={store.accounts.find(
                          (a) => a.id === post.accountId,
                        )}
                        onOpen={openPost}
                      />
                    ))}
                </div>
              ) : (
                <div className="empty-state">
                  <Layers3 size={32} />
                  <h3>No hay publicaciones en esta selección</h3>
                  <p>
                    {store.accounts.length
                      ? "Prueba otro periodo, formato o búsqueda."
                      : "Conecta Instagram y añade tu primer competidor."}
                  </p>
                  <button
                    className="button primary"
                    onClick={() => {
                      if (store.accounts.length) {
                        setSearch("");
                        setAccount("all");
                        setFormat("all");
                        setDays("0");
                      } else openAdd();
                    }}
                  >
                    {store.accounts.length
                      ? "Restablecer filtros"
                      : "Añadir competidor"}
                  </button>
                </div>
              )}
            </section>
          )}

          {page === "competitors" && (
            <>
              <div className="notice">
                <ShieldCheck size={18} />
                <span>
                  Consulta cuentas profesionales públicas. Se sincroniza una
                  muestra de hasta 50 publicaciones por cuenta; no incluye
                  métricas privadas ni seguimiento continuo.
                </span>
              </div>
              <div className="competitors-grid">
                {store.accounts.map((a, i) => {
                  const posts = store.posts.filter((p) => p.accountId === a.id);
                  const total = posts.reduce(
                    (n, p) => n + p.likes + p.comments,
                    0,
                  );
                  return (
                    <article className="competitor-card" key={a.id}>
                      <div className="competitor-top">
                        <span className={`avatar big tone-${i % 3}`}>
                          {a.name[0]}
                        </span>
                        <button
                          className="icon-button"
                          aria-label={`Eliminar a ${a.name}`}
                          onClick={() => {
                            setRemoveId(a.id);
                            setModal("remove");
                          }}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                      <h2>{a.name}</h2>
                      <span className="muted">@{a.username}</span>
                      <span className="topic-tag">
                        {a.demo
                          ? "Cuenta ficticia · demostración"
                          : "Instagram · cuenta profesional"}
                      </span>
                      <div className="competitor-stats">
                        <div>
                          <strong>
                            {a.followers == null ? "—" : compact(a.followers)}
                          </strong>
                          <span>seguidores</span>
                        </div>
                        <div>
                          <strong>{posts.length}</strong>
                          <span>publicaciones</span>
                        </div>
                        <div>
                          <strong>{compact(total)}</strong>
                          <span>interacciones</span>
                        </div>
                      </div>
                      <div className="competitor-footer">
                        <span>
                          {a.syncedAt
                            ? `Sincronizado ${date(a.syncedAt)}`
                            : "Datos de ejemplo"}
                        </span>
                        <button
                          disabled={busy}
                          className="text-button"
                          onClick={() => {
                            if (a.demo || !connection.connected)
                              openConnection();
                            else {
                              setUsername(a.username);
                              setFormError("");
                              setModal("add");
                            }
                          }}
                        >
                          <RefreshCw size={14} />
                          Sincronizar
                        </button>
                      </div>
                      <button
                        className="button white full"
                        onClick={() => {
                          setAccount(a.id);
                          setFormat("all");
                          setSearch("");
                          setDays("0");
                          navigate("library");
                        }}
                      >
                        Ver contenido <ArrowRight size={15} />
                      </button>
                    </article>
                  );
                })}
                <button className="add-competitor-card" onClick={openAdd}>
                  <span>
                    <Plus size={24} />
                  </span>
                  <h3>Amplía tu radar</h3>
                  <p>
                    Añade un creador de tu nicho
                    <br />y descubre nuevas referencias.
                  </p>
                  <strong>
                    Añadir competidor <ArrowUpRight size={14} />
                  </strong>
                </button>
              </div>
              {formError && <div className="notice error">{formError}</div>}
            </>
          )}

          {page === "ideas" && (
            <>
              <div className="ideas-intro">
                <Lightbulb size={21} />
                <p>
                  Estas propuestas usan reglas editoriales a partir de tus
                  referencias con mayor interacción relativa.{" "}
                  <strong>
                    No son predicciones de rendimiento ni consejos médicos.
                  </strong>
                </p>
              </div>
              <div className="ideas-toolbar">
                <div className="format-tabs">
                  <button
                    className={ideaTab === "suggested" ? "selected" : ""}
                    onClick={() => setIdeaTab("suggested")}
                  >
                    Para inspirarte <span>{ideas.length}</span>
                  </button>
                  <button
                    className={ideaTab === "saved" ? "selected" : ""}
                    onClick={() => setIdeaTab("saved")}
                  >
                    Guardadas <span>{store.savedIdeas.length}</span>
                  </button>
                </div>
                <span className="muted">Tu voz hace la diferencia.</span>
              </div>
              <div className="ideas-grid">
                {shownIdeas.map((idea, i) => {
                  const saved = store.savedIdeas.some((s) => s.id === idea.id);
                  const source = store.posts.find(
                    (p) => p.id === idea.sourceId,
                  );
                  return (
                    <article className="idea-card" key={idea.id}>
                      <div className="idea-top">
                        <span className="idea-number">
                          IDEA {String(i + 1).padStart(2, "0")}
                        </span>
                        <button
                          className={`icon-button ${saved ? "is-saved" : ""}`}
                          aria-label={
                            saved ? "Quitar idea de guardadas" : "Guardar idea"
                          }
                          onClick={() => saveIdea(idea)}
                        >
                          <Bookmark
                            size={19}
                            fill={saved ? "currentColor" : "none"}
                          />
                        </button>
                      </div>
                      <span className="topic-tag">{idea.topic}</span>
                      <h2>{idea.title}</h2>
                      <div className="idea-hook">
                        <span>PRUEBA ESTE GANCHO</span>
                        <p>{idea.hook}</p>
                      </div>
                      <p className="idea-reason">{idea.reason}</p>
                      <div className="idea-footer">
                        {source && (
                          <button
                            className="text-button"
                            onClick={() => openPost(source)}
                          >
                            Ver referencia <ArrowUpRight size={14} />
                          </button>
                        )}
                        <button
                          className="text-button"
                          onClick={() => {
                            setEditIdea({
                              ...idea,
                              notes:
                                store.savedIdeas.find((s) => s.id === idea.id)
                                  ?.notes || "",
                            });
                            setModal("idea");
                          }}
                        >
                          Desarrollar idea <ArrowRight size={14} />
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
              {!shownIdeas.length && (
                <div className="empty-state">
                  <Lightbulb size={34} />
                  <h3>
                    {ideaTab === "saved"
                      ? "Tu libreta está esperando"
                      : "Primero, un poco de inspiración"}
                  </h3>
                  <p>
                    {ideaTab === "saved"
                      ? "Guarda una propuesta y desarrolla aquí tu propio enfoque."
                      : "Añade contenido o amplía el periodo para encontrar referencias."}
                  </p>
                  <button
                    className="button primary"
                    onClick={() =>
                      ideaTab === "saved"
                        ? setIdeaTab("suggested")
                        : navigate("library")
                    }
                  >
                    {ideaTab === "saved"
                      ? "Explorar propuestas"
                      : "Ir a la biblioteca"}
                  </button>
                </div>
              )}
            </>
          )}
          <footer className="page-footer">
            <span>
              <Activity size={13} /> Hecho para crear con intención.
            </span>
            <span>
              {page === "camera"
                ? "Monitor de cámara · conexión entre dispositivos"
                : store.demo
                  ? "Muestra ilustrativa · ninguna cuenta real"
                  : "Datos públicos · las métricas pueden cambiar"}
            </span>
          </footer>
        </main>
      </div>
      {toast && (
        <div className="toast" role="status">
          <Check size={18} />
          <span>{toast}</span>
          <button
            className="icon-button"
            aria-label="Cerrar notificación"
            onClick={() => setToast("")}
          >
            <X size={16} />
          </button>
        </div>
      )}

      {modal === "connection" && (
        <Modal
          title={
            connection.connected
              ? "Tu conexión con Instagram"
              : "Conecta Instagram a tu radar"
          }
          onClose={() => setModal(null)}
        >
          <div className="connection-hero">
            <span>
              <Instagram size={30} />
            </span>
            <div>
              <h3>Tu cuenta abre la puerta.</h3>
              <p>
                Consulta contenido público de otros creadores profesionales
                mediante la API oficial de Meta.
              </p>
            </div>
          </div>
          {connection.loading ? (
            <p role="status">Comprobando conexión…</p>
          ) : connection.connected ? (
            <>
              <div className="notice success">
                <Check size={18} />
                Tu sesión de Meta está conectada.
              </div>
              <label className="field">
                Cuenta profesional para las consultas
                <select
                  value={connection.selected}
                  onChange={async (e) => {
                    setBusy(true);
                    try {
                      await postRequest("select", { id: e.target.value });
                      await refreshConnection();
                    } catch (err) {
                      setFormError(err.message);
                    } finally {
                      setBusy(false);
                    }
                  }}
                  disabled={busy}
                >
                  {connection.accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      @{a.username}
                    </option>
                  ))}
                </select>
              </label>
              <p className="help-text">
                {connection.sessionMode === "shared"
                  ? "La sesión se guarda en el almacén privado del servidor durante un máximo de 8 horas."
                  : "La sesión se guarda solo en la memoria del servidor, durante un máximo de 8 horas. Si se reinicia, vuelve a conectar."}
              </p>
              <div className="modal-actions">
                <button
                  disabled={busy}
                  className="button white"
                  onClick={async () => {
                    setBusy(true);
                    try {
                      await postRequest("disconnect");
                      await refreshConnection();
                      setToast(
                        "Sesión desconectada. Tus referencias guardadas siguen en este navegador.",
                      );
                      setModal(null);
                    } catch (e) {
                      setFormError(e.message);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  <LogOut size={16} />
                  Desconectar
                </button>
                <button
                  className="button primary"
                  onClick={() => {
                    setUsername("");
                    setFormError("");
                    setModal("add");
                  }}
                >
                  <Plus size={16} />
                  Añadir competidor
                </button>
              </div>
            </>
          ) : (
            <>
              <ol className="connection-steps">
                <li>
                  <span>1</span>
                  <div>
                    <strong>Una cuenta profesional de Instagram</strong>
                    <p>
                      Empresa o creador, vinculada a una página de Facebook que
                      administres.
                    </p>
                  </div>
                </li>
                <li>
                  <span>2</span>
                  <div>
                    <strong>Autoriza tu app en Meta</strong>
                    <p>
                      Selecciona la página y concede los permisos solicitados.
                      Pulso no pide tu contraseña.
                    </p>
                  </div>
                </li>
                <li>
                  <span>3</span>
                  <div>
                    <strong>Añade las cuentas de tu competencia</strong>
                    <p>
                      Sincroniza publicaciones, likes, comentarios y número de
                      seguidores.
                    </p>
                  </div>
                </li>
              </ol>
              {!connection.configured && (
                <div className="setup-box">
                  <h4>
                    <Settings2 size={16} />
                    Falta configurar la app de Meta
                  </h4>
                  <p>
                    El servidor necesita las siguientes variables. Introdúcelas
                    en la configuración segura del entorno o en tu archivo local{" "}
                    <code>.env</code>.
                  </p>
                  <div className="config-keys">
                    {(
                      connection.missing || [
                        "META_APP_ID",
                        "META_APP_SECRET",
                        "APP_URL",
                      ]
                    ).map((k) => (
                      <code key={k}>{k}</code>
                    ))}
                  </div>
                  <p>
                    En Meta, registra como URI de redirección{" "}
                    <code>APP_URL/api/instagram/callback</code>. La guía
                    completa está en el README del proyecto.
                  </p>
                </div>
              )}
              <div className="notice">
                <ShieldCheck size={18} />
                <span>
                  No incluye cuentas privadas, guardados, alcance interno ni
                  reproducciones de competidores. Los permisos y el acceso deben
                  ser aprobados por Meta.
                </span>
              </div>
              <div className="modal-actions">
                <button className="button white" onClick={() => setModal(null)}>
                  Seguir explorando
                </button>
                <button
                  disabled={
                    !connection.configured ||
                    Boolean(connectionError) ||
                    connection.loading
                  }
                  className="button primary"
                  onClick={() => {
                    window.location.assign("/api/instagram/connect");
                  }}
                >
                  <Instagram size={17} />
                  Continuar con Meta <ArrowUpRight size={16} />
                </button>
              </div>
            </>
          )}
          {formError && (
            <p className="form-error" role="alert">
              {formError}
            </p>
          )}
          {connectionError && (
            <p className="form-error" role="alert">
              {connectionError}
            </p>
          )}
        </Modal>
      )}

      {modal === "add" && (
        <Modal
          title="Un nuevo competidor en tu radar"
          onClose={() => !busy && setModal(null)}
        >
          <p className="modal-description">
            Introduce el usuario de una cuenta profesional pública de Instagram.
            Consultaremos sus últimas publicaciones disponibles.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              sync(username);
            }}
          >
            <label className="field">
              Usuario de Instagram
              <div className="username-field">
                <span>@</span>
                <input
                  autoFocus
                  required
                  maxLength={31}
                  value={username}
                  placeholder="nombre.del.creador"
                  onChange={(e) => setUsername(e.target.value)}
                  disabled={busy}
                />
              </div>
            </label>
            <div className="notice">
              <Link2 size={18} />
              <span>
                Hasta 50 publicaciones por consulta. Puedes volver a sincronizar
                cada cuenta cuando quieras.
              </span>
            </div>
            {store.demo && (
              <p className="help-text">
                La primera sincronización real sustituirá la muestra ficticia.
              </p>
            )}
            {formError && (
              <p className="form-error" role="alert">
                {formError}
              </p>
            )}
            <div className="modal-actions">
              <button
                className="button white"
                type="button"
                disabled={busy}
                onClick={() => setModal(null)}
              >
                Cancelar
              </button>
              <button
                className="button primary"
                disabled={busy || !username.trim()}
                type="submit"
              >
                <RefreshCw className={busy ? "spin" : ""} size={16} />
                {busy ? "Consultando Instagram…" : "Añadir y sincronizar"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {modal === "post" && selectedPost && (
        <Modal title="Detrás del contenido" wide onClose={() => setModal(null)}>
          <div className="post-detail">
            <Artwork post={selectedPost} large />
            <div className="detail-copy">
              <span className="topic-tag">{selectedPost.topic}</span>
              <h3>
                @
                {
                  store.accounts.find((a) => a.id === selectedPost.accountId)
                    ?.username
                }
              </h3>
              <span className="muted">
                {formats[selectedPost.format]} ·{" "}
                {new Date(selectedPost.date).toLocaleDateString("es-ES")}
              </span>
              <p className="full-caption">{selectedPost.caption}</p>
              <div className="detail-metrics">
                <div>
                  <Heart size={16} />
                  <strong>
                    {selectedPost.likesAvailable === false
                      ? "—"
                      : number(selectedPost.likes)}
                  </strong>
                  <span>me gusta</span>
                </div>
                <div>
                  <MessageCircle size={16} />
                  <strong>
                    {selectedPost.commentsAvailable === false
                      ? "—"
                      : number(selectedPost.comments)}
                  </strong>
                  <span>comentarios</span>
                </div>
                <div>
                  <Activity size={16} />
                  <strong>
                    {percent(
                      engagement(
                        selectedPost,
                        store.accounts.find(
                          (a) => a.id === selectedPost.accountId,
                        ),
                      ),
                    )}
                  </strong>
                  <span>interacción / seguidores</span>
                </div>
              </div>
              <p className="help-text">
                La proporción usa los seguidores actuales de la cuenta. No
                equivale a alcance ni permite comparar periodos históricos de
                seguidores. Los likes ocultos pueden dejar la proporción
                incompleta.
              </p>
              {safeInstagramUrl(selectedPost.url) ? (
                <a
                  className="button white"
                  href={selectedPost.url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Ver publicación en Instagram <ExternalLink size={15} />
                </a>
              ) : (
                <p className="help-text">
                  Ejemplo ilustrativo: esta publicación no tiene enlace real.
                </p>
              )}
            </div>
          </div>
        </Modal>
      )}

      {modal === "remove" && (
        <Modal
          title="¿Quitar esta cuenta de tu radar?"
          onClose={() => setModal(null)}
        >
          <p className="modal-description">
            Se eliminarán de este navegador la cuenta y sus publicaciones
            sincronizadas. Tus ideas guardadas se conservarán.
          </p>
          <div className="modal-actions">
            <button className="button white" onClick={() => setModal(null)}>
              Cancelar
            </button>
            <button
              className="button danger"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  if (connection.connected && !store.demo) {
                    if (!cloudRef.current)
                      throw new Error("Espera a que se cargue tu espacio.");
                    applyCloud(
                      await postRequest("pro/remove", {
                        id: removeId,
                        revision: cloudRef.current.revision,
                      }),
                    );
                  } else
                    setStore((s) => ({
                      ...s,
                      accounts: s.accounts.filter((a) => a.id !== removeId),
                      posts: s.posts.filter((p) => p.accountId !== removeId),
                    }));
                  if (account === removeId) setAccount("all");
                  setModal(null);
                  setToast("Cuenta eliminada del radar.");
                } catch (e) {
                  setCloudError(e.message);
                  setModal(null);
                } finally {
                  setBusy(false);
                }
              }}
            >
              Quitar competidor
            </button>
          </div>
        </Modal>
      )}

      {modal === "idea" && editIdea && (
        <Modal title="Dale tu propio enfoque" onClose={() => setModal(null)}>
          <label className="field">
            Título de tu idea
            <input
              value={editIdea.title}
              maxLength={200}
              onChange={(e) =>
                setEditIdea({ ...editIdea, title: e.target.value })
              }
            />
          </label>
          <div className="idea-hook">
            <span>UNA ESTRUCTURA PARA EMPEZAR</span>
            <p>{editIdea.structure}</p>
          </div>
          <label className="field">
            Tu guion y tus notas
            <textarea
              rows={6}
              value={editIdea.notes}
              placeholder="¿Qué contarías desde tu experiencia? Anota tu gancho, ejemplos, fuentes y llamada a la acción…"
              onChange={(e) =>
                setEditIdea({ ...editIdea, notes: e.target.value })
              }
            />
          </label>
          <p className="help-text">
            Revisa las afirmaciones sobre salud y nutrición y respáldalas con
            fuentes adecuadas antes de publicar.
          </p>
          <div className="modal-actions">
            <button className="button white" onClick={() => setModal(null)}>
              Cancelar
            </button>
            <button
              className="button primary"
              disabled={!editIdea.title.trim()}
              onClick={async () => {
                try {
                  await persistIdeas([
                    ...store.savedIdeas.filter((i) => i.id !== editIdea.id),
                    { ...editIdea, savedAt: new Date().toISOString() },
                  ]);
                  setModal(null);
                  setToast("Idea guardada en tu libreta.");
                } catch (e) {
                  setCloudError(e.message);
                  setModal(null);
                }
              }}
            >
              <Bookmark size={16} />
              Guardar idea
            </button>
          </div>
        </Modal>
      )}

      {modal === "settings" && (
        <Modal
          title="Tus datos, bajo tu control"
          onClose={() => setModal(null)}
        >
          <div className="notice">
            <ShieldCheck size={19} />
            <span>
              Con Instagram conectado, tus datos reales y tus ideas se guardan
              en tu espacio privado del servidor. Conservamos hasta 90
              mediciones diarias por cuenta; el espacio caduca tras 180 días sin
              actualizaciones. La demostración se guarda en este navegador. Los
              tokens nunca se exportan.
            </span>
          </div>
          <div className="settings-row">
            <div>
              <strong>Exportar una copia</strong>
              <p>Descarga tus cuentas, publicaciones e ideas en JSON.</p>
            </div>
            <button className="button white" onClick={download}>
              <Download size={16} />
              Exportar
            </button>
          </div>
          {readBackup() && (
            <div className="settings-row">
              <div>
                <strong>Copia anterior a la nube</strong>
                <p>
                  Conserva tus datos locales anteriores a esta actualización.
                </p>
              </div>
              <button
                className="button white"
                onClick={() => {
                  const raw = readBackup();
                  const url = URL.createObjectURL(
                    new Blob([raw], { type: "application/json" }),
                  );
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = "pulso-copia-anterior.json";
                  a.click();
                  setTimeout(() => URL.revokeObjectURL(url), 1000);
                }}
              >
                Exportar copia anterior
              </button>
            </div>
          )}
          <div className="settings-row">
            <div>
              <strong>Conexión con Instagram</strong>
              <p>
                {connection.connected
                  ? "Sesión activa con Meta. Desconectar también desactiva el seguimiento diario."
                  : "No hay ninguna cuenta conectada."}
              </p>
            </div>
            <button className="button white" onClick={openConnection}>
              Gestionar <ArrowUpRight size={15} />
            </button>
          </div>
          <div className="settings-row">
            <div>
              <strong>
                {store.demo
                  ? "Empezar con mi espacio vacío"
                  : "Vaciar el espacio de trabajo"}
              </strong>
              <p>
                Elimina los datos del espacio activo y desactiva su seguimiento.
              </p>
            </div>
            <button className="button white" onClick={() => setModal("reset")}>
              Vaciar
            </button>
          </div>
          <p className="help-text">
            Pulso · Seguimiento diario opcional en Análisis avanzado. La IA se
            activa desde el servidor y se ejecuta solo cuando la solicitas. No
            hay publicación automática.
          </p>
        </Modal>
      )}
      {modal === "reset" && (
        <Modal
          title="¿Vaciar el espacio de trabajo?"
          onClose={() => setModal(null)}
        >
          <p className="modal-description">
            Se borrarán los datos de tu espacio activo, incluido el historial y
            los análisis guardados, y se desactivará su seguimiento. Exporta una
            copia si quieres conservarlos.
          </p>
          <div className="modal-actions">
            <button className="button white" onClick={download}>
              <Download size={16} />
              Exportar copia
            </button>
            <button
              className="button danger"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  if (connection.connected && !store.demo) {
                    if (!cloudRef.current)
                      throw new Error("Espera a que se cargue tu espacio.");
                    applyCloud(
                      await postRequest("pro/reset", {
                        revision: cloudRef.current.revision,
                      }),
                    );
                  } else setStore(emptyStore());
                  setAccount("all");
                  setModal(null);
                  setToast("Espacio de trabajo vacío.");
                } catch (e) {
                  setCloudError(e.message);
                  setModal(null);
                } finally {
                  setBusy(false);
                }
              }}
            >
              Confirmar borrado
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

createRoot(document.getElementById("root")).render(
  window.location.pathname.replace(/\/$/, "") === "/camera" ? (
    <CameraPage standalone />
  ) : (
    <App />
  ),
);
