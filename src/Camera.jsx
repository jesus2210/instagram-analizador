import React, { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import {
  Camera,
  Monitor,
  Smartphone,
  Maximize,
  RefreshCw,
  Square,
  Circle,
  Download,
  Share2,
  Check,
  ShieldCheck,
  FlipHorizontal,
  Grid3X3,
  X,
  ArrowLeft,
} from "lucide-react";
import {
  cameraApi,
  makePeer,
  gather,
  pause,
  parseCameraLink,
  cameraSupported,
  cameraError,
} from "./camera-peer.js";
import "./camera.css";
const notify = (channel, data) => {
  if (channel?.readyState === "open")
    try {
      channel.send(JSON.stringify(data));
    } catch {}
};
const closePeer = (peer) => {
  if (peer) {
    peer.onconnectionstatechange = null;
    peer.ontrack = null;
    peer.close();
  }
};
const describe = (stream) => {
  const s = stream?.getVideoTracks()[0]?.getSettings();
  return s?.width && s?.height
    ? `${s.width} × ${s.height}${s.frameRate ? ` · ${Math.round(s.frameRate)} fps` : ""}`
    : "";
};
function leaveRoom(room, key) {
  if (room && key)
    cameraApi(`rooms/${room.id}`, { key, method: "DELETE" }).catch(() => {});
}
// Counts ICE candidate kinds only; never prints addresses.
function candidateSummary(sdp = "") {
  const lines = sdp.split(/\r?\n/).filter((l) => l.startsWith("a=candidate:"));
  const count = (type) => lines.filter((l) => l.includes(` typ ${type}`)).length;
  const mdns = lines.filter((l) => /\s[0-9a-f-]+\.local\s/i.test(l)).length;
  return `Candidatos: local=${count("host")} (mDNS=${mdns}), stun=${count("srflx")}, relay=${count("relay")}`;
}
const clock = (seconds) =>
  `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
export default function CameraPage({ standalone = false }) {
  const [join] = useState(() => parseCameraLink());
  const [invalidLink] = useState(
    () => !join && /[#&](room|key)=/.test(window.location.hash),
  );
  useEffect(() => {
    if (join) window.history.replaceState(null, "", window.location.pathname);
  }, [join]);
  const screenJoin =
    window.location.pathname.replace(/\/$/, "") === "/screen" && join;
  return (
    <div className={`camera-module ${standalone ? "camera-standalone" : ""}`}>
      {standalone && (
        <header className="camera-header">
          <a href="/" aria-label="Volver a Pulso">
            <ActivityLogo /> pulso.
          </a>
          <span>Tu monitor de cámara</span>
        </header>
      )}
      {invalidLink ? (
        <section className="camera-card">
          <h1>Este enlace de cámara no es válido.</h1>
          <p>Genera un nuevo QR en la laptop y escanéalo con el iPhone.</p>
        </section>
      ) : screenJoin ? (
        <ScreenLanding join={join} />
      ) : !cameraSupported() ? (
        <section className="camera-card">
          <h1>Abre Pulso desde una conexión segura</h1>
          <p>
            Usa la dirección HTTPS de Pulso en Safari en el iPhone y Chrome o
            Edge en Windows. Este navegador necesita admitir conexión de vídeo
            entre dispositivos.
          </p>
        </section>
      ) : join ? (
        <Sender join={join} />
      ) : (
        <Viewer />
      )}
    </div>
  );
}
function ActivityLogo() {
  return <Camera size={23} />;
}
function Viewer() {
  const [mode, setMode] = useState("camera");
  const [room, setRoom] = useState(null),
    [qr, setQr] = useState(""),
    [status, setStatus] = useState("idle"),
    [error, setError] = useState("");
  const [mirrored, setMirrored] = useState(false),
    [grid, setGrid] = useState(false),
    [remote, setRemote] = useState({ state: "idle", supported: false }),
    [copied, setCopied] = useState(false);
  const [diag, setDiag] = useState([]),
    [vlog, setVlog] = useState([]);
  const addLog = (message) =>
    setVlog((lines) =>
      [...lines, `${new Date().toLocaleTimeString()} ${message}`].slice(-30),
    );
  const video = useRef(null),
    stage = useRef(null),
    peer = useRef(null),
    channel = useRef(null),
    abort = useRef(null),
    roomRef = useRef(null),
    alive = useRef(true),
    timer = useRef(null);
  const busy = useRef(false);
  function stop(update = true) {
    abort.current?.abort();
    clearTimeout(timer.current);
    notify(channel.current, { type: "end" });
    channel.current?.close();
    channel.current = null;
    closePeer(peer.current);
    peer.current = null;
    leaveRoom(roomRef.current, roomRef.current?.viewerKey);
    roomRef.current = null;
    if (video.current) video.current.srcObject = null;
    if (update && alive.current) {
      setStatus("idle");
      setRoom(null);
      setQr("");
      setRemote({ state: "idle", supported: false });
    }
  }
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      stop(false);
    };
  }, []);
  async function create() {
    if (busy.current) return;
    busy.current = true;
    stop();
    setError("");
    setStatus("creating");
    setCopied(false);
    setDiag([]);
    setVlog([]);
    const control = new AbortController();
    abort.current = control;
    try {
      const data = await cameraApi("rooms", {
        method: "POST",
        body: { mode },
        signal: control.signal,
      });
      if (control.signal.aborted) {
        leaveRoom(data, data.viewerKey);
        return;
      }
      roomRef.current = data;
      setRoom(data);
      const url = `${window.location.origin}/${mode === "screen" ? "screen" : "camera"}#room=${data.id}&key=${data.senderKey}`;
      const code = await QRCode.toDataURL(url, {
        width: 280,
        margin: 3,
        errorCorrectionLevel: "M",
        color: { dark: "#254f3f", light: "#ffffff" },
      });
      if (control.signal.aborted) return;
      setQr(code);
      setStatus("waiting");
      addLog("QR creado; esperando al iPhone");
      // Keep reading the iPhone's step log until the room is closed.
      (async () => {
        while (!control.signal.aborted && roomRef.current === data) {
          try {
            const r = await cameraApi(`rooms/${data.id}`, {
              key: data.viewerKey,
              signal: control.signal,
            });
            if (alive.current && Array.isArray(r.diag)) setDiag(r.diag);
          } catch (e) {
            if (e.status === 404 || e.name === "AbortError") break;
          }
          try {
            await pause(2000, control.signal);
          } catch {
            break;
          }
        }
      })();
      let offer;
      while (!control.signal.aborted && Date.now() < data.expiresAt) {
        const result = await cameraApi(`rooms/${data.id}`, {
          key: data.viewerKey,
          signal: control.signal,
        });
        if (result.description) {
          offer = result.description;
          break;
        }
        await pause(2000, control.signal);
      }
      if (!offer)
        throw new Error(
          "El QR ha caducado. Genera otro y escanéalo con el iPhone.",
        );
      setStatus("connecting");
      setQr("");
      addLog(`Oferta del iPhone recibida. ${candidateSummary(offer.sdp)}`);
      const pc = makePeer();
      peer.current = pc;
      pc.oniceconnectionstatechange = () =>
        addLog(`ICE: ${pc.iceConnectionState}`);
      pc.ontrack = (e) => {
        if (video.current) {
          video.current.srcObject = e.streams[0] || new MediaStream([e.track]);
          video.current.play().catch(() => {});
        }
      };
      pc.onconnectionstatechange = () => {
        if (!alive.current || control.signal.aborted) return;
        addLog(`Conexión: ${pc.connectionState}`);
        if (pc.connectionState === "connected") {
          clearTimeout(timer.current);
          setStatus("connected");
        }
        if (pc.connectionState === "disconnected") {
          setStatus("reconnecting");
        }
        if (pc.connectionState === "failed") {
          clearTimeout(timer.current);
          setStatus("failed");
          setError(
            "La red no permite conectar directamente. Usa la misma Wi-Fi, sin red de invitados ni VPN, y vuelve a emparejar.",
          );
        }
        if (pc.connectionState === "closed") setStatus("idle");
      };
      pc.ondatachannel = (e) => {
        if (e.channel.label !== "pulso-camera") return;
        channel.current = e.channel;
        e.channel.onopen = () => notify(e.channel, { type: "hello" });
        e.channel.onmessage = (event) => {
          if (typeof event.data !== "string" || event.data.length > 1500)
            return;
          let m;
          try {
            m = JSON.parse(event.data);
          } catch {
            return;
          }
          if (m.type === "ready") {
            leaveRoom(data, data.viewerKey);
          }
          if (m.type === "record-state") {
            setRemote({
              state: m.state,
              supported: Boolean(m.supported),
              seconds: Number.isFinite(m.seconds) ? m.seconds : 0,
              clipReady: Boolean(m.clipReady),
            });
          }
          if (m.type === "error")
            setError(String(m.message || "Comprueba el iPhone.").slice(0, 250));
          if (m.type === "end") {
            stop();
            setStatus("ended");
          }
        };
        e.channel.onclose = () => {
          if (alive.current && !control.signal.aborted)
            setRemote((s) => ({ ...s, supported: false }));
        };
      };
      await pc.setRemoteDescription(offer);
      await pc.setLocalDescription(await pc.createAnswer());
      await gather(pc, control.signal);
      if (!pc.localDescription.sdp.includes("a=candidate:"))
        throw new Error(
          "El navegador o la red bloqueó la conexión directa. Permite el acceso a la red local si se solicita y usa Safari en el iPhone y Chrome o Edge en Windows.",
        );
      if (control.signal.aborted) return;
      addLog(`Respuesta enviada. ${candidateSummary(pc.localDescription.sdp)}`);
      await cameraApi(`rooms/${data.id}/answer`, {
        method: "POST",
        key: data.viewerKey,
        body: { description: { type: "answer", sdp: pc.localDescription.sdp } },
        signal: control.signal,
      });
      timer.current = setTimeout(() => {
        if (pc.connectionState !== "connected" && alive.current) {
          setStatus("failed");
          setError(
            "No llegó la imagen. Comprueba que Safari siga abierto en el iPhone y que ambos dispositivos estén en la misma Wi-Fi.",
          );
        }
      }, 30000);
    } catch (e) {
      if (!control.signal.aborted && alive.current) {
        setError(cameraError(e));
        setStatus("failed");
      }
    } finally {
      busy.current = false;
    }
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(
        `${location.origin}/${mode === "screen" ? "screen" : "camera"}#room=${room.id}&key=${room.senderKey}`,
      );
      setCopied(true);
    } catch {
      setError("No se pudo copiar el enlace. Escanea el QR con el iPhone.");
    }
  }
  const connected = ["connected", "reconnecting"].includes(status);
  return (
    <>
      <section className="camera-intro">
        <div>
          <span className="eyebrow">ENCUADRA. COMPRUEBA. GRABA.</span>
          <h1>Tu iPhone, frente a ti.</h1>
          <p>
            {mode === "screen"
              ? "Comparte la pantalla con Pulso Screen y sigue grabando desde Cámara de Apple. Requiere instalar nuestro prototipo de iPhone."
              : "Abre la cámara dentro del navegador y mírala en Windows. Este modo no muestra la app Cámara de Apple."}
          </p>
        </div>
        <Monitor size={40} />
      </section>
      <div
        className="camera-modes"
        role="group"
        aria-label="Origen de la imagen"
      >
        <button
          className={mode === "camera" ? "selected" : ""}
          disabled={!["idle", "ended", "failed"].includes(status)}
          aria-pressed={mode === "camera"}
          onClick={() => setMode("camera")}
        >
          Cámara del navegador (recomendado)
        </button>
        <button
          className={mode === "screen" ? "selected" : ""}
          disabled={!["idle", "ended", "failed"].includes(status)}
          aria-pressed={mode === "screen"}
          onClick={() => setMode("screen")}
        >
          Pantalla del iPhone (app propia, experimental)
        </button>
      </div>
      {mode === "screen" && (
        <div className="camera-card">
          <h2>Pulso Screen · prototipo para instalar</h2>
          <p>
            La app y la compilación para iOS están preparadas en el repositorio.
            Primero hay que generar el IPA, firmarlo en tu Windows e instalarlo.
            El funcionamiento de la transmisión con Cámara de Apple aún necesita
            la prueba en tu iPhone; no basta con la grabación de pantalla que ya
            probaste.
          </p>
          <a
            className="text-button"
            href="https://github.com/jesus2210/instagram-analizador/blob/main/native/ios/README.md"
            target="_blank"
            rel="noreferrer"
          >
            Ver instalación y renovación gratuita →
          </a>
        </div>
      )}
      {error && (
        <div className="camera-error" role="alert">
          {error}
        </div>
      )}
      <div className="camera-layout">
        <section className="camera-view" ref={stage}>
          <div className="camera-live-label">
            <span
              className={`camera-dot ${status === "connected" ? "is-live" : ""}`}
            />
            {status === "connected"
              ? "EN DIRECTO"
              : status === "reconnecting"
                ? "RECONECTANDO"
                : "MONITOR DE CÁMARA"}
            {remote.state === "recording" && (
              <strong>● REC {clock(remote.seconds || 0)}</strong>
            )}
          </div>
          <video
            ref={video}
            autoPlay
            muted
            playsInline
            className={mirrored ? "camera-mirrored" : ""}
            aria-label="Imagen de la cámara del iPhone"
          />
          {!connected && (
            <div className="camera-placeholder">
              <Camera size={48} />
              <h2>
                {status === "waiting"
                  ? "Escanea el QR con tu iPhone"
                  : status === "connecting"
                    ? "Conectando la cámara…"
                    : status === "creating"
                      ? "Preparando tu QR…"
                      : status === "ended"
                        ? "Sesión terminada"
                        : "Tu encuadre aparecerá aquí"}
              </h2>
              <p>
                {mode === "screen"
                  ? "Empareja Pulso Screen, confirma la transmisión en iOS y después abre Cámara de Apple."
                  : "Abre la cámara dentro de Pulso en el iPhone. Su imagen se mostrará aquí."}
              </p>
            </div>
          )}
          {grid && (
            <div className="camera-grid" aria-hidden="true">
              <i />
              <i />
              <i />
              <i />
            </div>
          )}
          <div className="camera-view-controls">
            <button
              disabled={!connected}
              onClick={() => setMirrored((v) => !v)}
              aria-pressed={mirrored}
              aria-label="Reflejar vista del monitor"
            >
              <FlipHorizontal size={18} />
            </button>
            <button
              disabled={!connected}
              onClick={() => setGrid((v) => !v)}
              aria-pressed={grid}
              aria-label="Mostrar cuadrícula"
            >
              <Grid3X3 size={18} />
            </button>
            <button
              disabled={!connected}
              onClick={() =>
                stage.current
                  ?.requestFullscreen?.()
                  .catch(() =>
                    setError("No se pudo abrir la pantalla completa."),
                  )
              }
              aria-label="Pantalla completa"
            >
              <Maximize size={18} />
            </button>
          </div>
        </section>
        <aside className="camera-card camera-pairing">
          <span className="eyebrow">IPHONE → WINDOWS</span>
          <h2>{connected ? "Ya puedes verte." : "Conecta en tres pasos"}</h2>
          {qr ? (
            <>
              <img
                src={qr}
                width="280"
                height="280"
                alt={
                  mode === "screen"
                    ? "QR privado para compartir la pantalla del iPhone"
                    : "QR privado para conectar la cámara del iPhone"
                }
              />
              <p className="camera-small">
                Caduca en 5 minutos. Compártelo solo con tu iPhone.{" "}
                {mode === "screen"
                  ? "Elige Abrir Pulso Screen después de escanearlo."
                  : "Permite la cámara en Safari."}
              </p>
              <button className="button white" onClick={copy}>
                {copied ? <Check size={16} /> : <Smartphone size={16} />}{" "}
                {copied ? "Enlace copiado" : "Copiar enlace para el iPhone"}
              </button>
            </>
          ) : connected ? (
            <div className="camera-paired">
              <Check size={32} />
              <p>
                {mode === "screen"
                  ? "Abre Cámara de Apple en el iPhone y controla el encuadre aquí. Graba desde los controles de Cámara."
                  : "Coloca el iPhone apuntándote y mira el resultado en la laptop."}
              </p>
            </div>
          ) : (
            <ol className="camera-steps">
              <li>Abre este monitor en la laptop.</li>
              <li>Genera un QR y escanéalo con el iPhone.</li>
              <li>
                {mode === "screen"
                  ? "Abre Pulso Screen, configura el enlace y confirma la transmisión de pantalla."
                  : "En Safari, pulsa Permitir cámara y conectar."}
              </li>
            </ol>
          )}
          {["idle", "failed", "ended"].includes(status) && (
            <button className="button primary" onClick={create}>
              <Camera size={17} />
              {mode === "screen"
                ? "Generar QR de pantalla"
                : "Generar QR de cámara"}
            </button>
          )}
          {["creating", "connecting"].includes(status) && (
            <p role="status">
              {status === "creating"
                ? "Creando enlace temporal…"
                : "Abre Safari y mantén la pantalla del iPhone encendida."}
            </p>
          )}
          {[
            "waiting",
            "connecting",
            "creating",
            ...["connected", "reconnecting"],
          ].includes(status) && (
            <button className="button white" onClick={() => stop()}>
              <X size={16} />
              Terminar sesión
            </button>
          )}
          {(diag.length > 0 || vlog.length > 0) && (
            <details className="camera-small" open={!connected}>
              <summary>Diagnóstico de conexión</summary>
              <pre
                style={{
                  whiteSpace: "pre-wrap",
                  fontSize: 12,
                  maxHeight: 220,
                  overflow: "auto",
                }}
              >
                {[
                  ...(diag.length ? ["— iPhone —", ...diag] : []),
                  ...(vlog.length ? ["— Windows —", ...vlog] : []),
                ].join("\n")}
              </pre>
            </details>
          )}
          {connected && mode === "screen" && (
            <div className="camera-record-remote">
              <h3>Graba desde Cámara de Apple</h3>
              <p>
                Este monitor no inicia ni detiene la grabación de la app Cámara.
                El vídeo final queda en Fotos del iPhone.
              </p>
            </div>
          )}
          {connected && mode === "camera" && (
            <div className="camera-record-remote">
              <h3>Grabación opcional</h3>
              <p>
                El clip queda en el iPhone. Podrás compartirlo o descargarlo
                allí.
              </p>
              <button
                className={`button ${remote.state === "recording" ? "camera-danger" : "primary"}`}
                disabled={
                  !remote.supported ||
                  remote.state === "preparing" ||
                  remote.state === "saving"
                }
                onClick={() =>
                  notify(channel.current, {
                    type:
                      remote.state === "recording"
                        ? "stop-recording"
                        : "start-recording",
                  })
                }
              >
                {remote.state === "recording" ? (
                  <Square size={15} />
                ) : (
                  <Circle size={15} />
                )}{" "}
                {remote.state === "recording"
                  ? "Detener grabación"
                  : remote.state === "preparing"
                    ? "Permite el micrófono en el iPhone…"
                    : "Grabar en el iPhone"}
              </button>
              {remote.clipReady && (
                <p className="camera-success">
                  Clip listo para guardar en el iPhone.
                </p>
              )}
            </div>
          )}
        </aside>
      </div>
      <section className="camera-notes">
        <p>
          <ShieldCheck size={17} />
          La imagen viaja cifrada entre tus dispositivos. El servidor solo
          conserva el emparejamiento temporal, que se elimina al conectar o
          caduca a los 5 minutos.
        </p>
        <p>
          Usa la misma Wi-Fi y mantén Safari abierto. Las redes de invitados,
          algunas VPN o el bloqueo del iPhone pueden interrumpir la conexión. La
          cámara y la grabación usan las posibilidades del navegador; no
          duplican la app Cámara de Apple.
        </p>
      </section>
    </>
  );
}
function ScreenLanding({ join }) {
  const [copied, setCopied] = useState(false),
    [error, setError] = useState("");
  const url = `${location.origin}/screen#room=${join.id}&key=${join.key}`;
  const nativeURL = `pulsoscreen://pair?room=${join.id}&key=${join.key}`;
  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      setError(
        "No se pudo copiar. Vuelve a escanear el QR y abre Pulso Screen.",
      );
    }
  }
  return (
    <div className="camera-phone">
      <section className="camera-intro">
        <div>
          <span className="eyebrow">
            COMPARTE PANTALLA. USA CÁMARA DE APPLE.
          </span>
          <h1>Abre Pulso Screen en tu iPhone.</h1>
          <p>
            Este modo necesita nuestra app instalada. Safari no puede transmitir
            la pantalla de otras apps.
          </p>
        </div>
      </section>
      <section className="camera-card">
        <h2>Primero, prepara la transmisión</h2>
        <ol className="camera-steps">
          <li>Abre Pulso Screen con el botón inferior.</li>
          <li>
            En la app, pega el enlace y pulsa Preparar transmisión. En la hoja
            de iOS elige Pulso Screen y pulsa Iniciar emisión.
          </li>
          <li>
            Cuando Windows reciba la imagen, abre Cámara y graba allí.
          </li>
        </ol>
        <a className="button primary" href={nativeURL}>
          <Smartphone size={17} />
          Abrir Pulso Screen
        </a>
        <button className="button white" onClick={copy}>
          {copied ? <Check size={16} /> : <Share2 size={16} />}{" "}
          {copied ? "Enlace copiado" : "Copiar enlace de emparejamiento"}
        </button>
        <p>
          Se compartirá toda la pantalla, sin audio. El vídeo de Cámara queda en
          Fotos; Pulso no lo guarda.
        </p>
        {error && (
          <p className="camera-error" role="alert">
            {error}
          </p>
        )}
      </section>
      <section className="camera-card">
        <h2>¿Todavía no está instalada?</h2>
        <p>
          El prototipo debe compilarse y firmarse antes de instalarlo. La firma
          gratuita normalmente requiere renovación cada siete días. La
          transmisión de Cámara aún está pendiente de comprobar en tu
          dispositivo.
        </p>
        <a
          className="text-button"
          href="https://github.com/jesus2210/instagram-analizador/blob/main/native/ios/README.md"
          target="_blank"
          rel="noreferrer"
        >
          Ver instrucciones de Windows →
        </a>
      </section>
    </div>
  );
}
function Sender({ join }) {
  const [status, setStatus] = useState("idle"),
    [error, setError] = useState(""),
    [resolution, setResolution] = useState("");
  const [devices, setDevices] = useState([]),
    [selectedDevice, setSelectedDevice] = useState(""),
    [sound, setSound] = useState(true);
  const [rec, setRec] = useState("idle"),
    [seconds, setSeconds] = useState(0),
    [clip, setClip] = useState(null);
  const video = useRef(null),
    stream = useRef(null),
    peer = useRef(null),
    channel = useRef(null),
    abort = useRef(null),
    alive = useRef(true),
    wake = useRef(null),
    handlers = useRef(null);
  const recorder = useRef(null),
    mic = useRef(null),
    recordState = useRef("idle"),
    recordTimer = useRef(null),
    clipRef = useRef(null),
    busy = useRef(false),
    recordOp = useRef(null),
    pairTimer = useRef(null);
  const supported = typeof MediaRecorder !== "undefined";
  function report(state = recordState.current, secs = 0) {
    notify(channel.current, {
      type: "record-state",
      state,
      seconds: secs,
      supported,
      clipReady: Boolean(clipRef.current),
    });
  }
  function changeRecord(state, secs = 0) {
    recordState.current = state;
    if (alive.current) {
      setRec(state);
      setSeconds(secs);
    }
    report(state, secs);
  }
  function stopRecording() {
    recordOp.current = null;
    if (recorder.current?.state === "recording") {
      changeRecord("saving");
      recorder.current.stop();
    } else if (recordState.current === "preparing") {
      mic.current?.getTracks().forEach((t) => t.stop());
      changeRecord("idle");
    }
  }
  async function startRecording() {
    if (recordState.current !== "idle") return;
    if (
      !stream.current?.getVideoTracks().some((t) => t.readyState === "live")
    ) {
      setError("Abre la cámara antes de grabar.");
      return;
    }
    if (
      clipRef.current &&
      !clipRef.current.saved &&
      !window.confirm(
        "Tienes un clip sin guardar. ¿Quieres reemplazarlo por una nueva grabación?",
      )
    )
      return;
    const op = crypto.randomUUID();
    recordOp.current = op;
    changeRecord("preparing");
    setError("");
    try {
      const audio = sound
        ? await navigator.mediaDevices.getUserMedia({
            audio: { echoCancellation: true, noiseSuppression: true },
            video: false,
          })
        : null;
      if (recordOp.current !== op || !alive.current) {
        audio?.getTracks().forEach((t) => t.stop());
        return;
      }
      mic.current = audio;
      const combined = new MediaStream([
        ...stream.current.getVideoTracks(),
        ...(audio?.getAudioTracks() || []),
      ]);
      const type = [
        "video/mp4",
        "video/webm;codecs=vp8,opus",
        "video/webm",
      ].find((t) => MediaRecorder.isTypeSupported(t));
      if (!type)
        throw new Error(
          "Este navegador no permite grabar el vídeo. Puedes seguir usando el monitor.",
        );
      const recording = new MediaRecorder(combined, {
        mimeType: type,
        videoBitsPerSecond: 8000000,
        audioBitsPerSecond: 128000,
      });
      const chunks = [];
      let size = 0;
      recorder.current = recording;
      recording.ondataavailable = (e) => {
        if (e.data.size) {
          chunks.push(e.data);
          size += e.data.size;
          if (size > 180 * 1024 * 1024 && recording.state === "recording")
            recording.stop();
        }
      };
      recording.onstop = () => {
        clearInterval(recordTimer.current);
        mic.current?.getTracks().forEach((t) => t.stop());
        mic.current = null;
        recordOp.current = null;
        const blob = new Blob(chunks, {
          type: recording.mimeType.split(";")[0],
        });
        if (blob.size && alive.current) {
          if (clipRef.current) URL.revokeObjectURL(clipRef.current.url);
          const result = {
            blob,
            url: URL.createObjectURL(blob),
            name: `pulso-${new Date().toISOString().replace(/[:.]/g, "-")}.${blob.type.includes("mp4") ? "mp4" : "webm"}`,
            saved: false,
          };
          clipRef.current = result;
          setClip(result);
        }
        if (alive.current) changeRecord("idle");
      };
      recording.onerror = () => {
        if (alive.current)
          setError(
            "La grabación se interrumpió. Revisa y guarda el clip disponible antes de salir.",
          );
        stopRecording();
      };
      recording.start(1000);
      changeRecord("recording");
      const start = Date.now();
      recordTimer.current = setInterval(() => {
        const secs = Math.floor((Date.now() - start) / 1000);
        if (alive.current) setSeconds(secs);
        report("recording", secs);
        if (secs >= 180 && recording.state === "recording") stopRecording();
      }, 1000);
    } catch (e) {
      mic.current?.getTracks().forEach((t) => t.stop());
      mic.current = null;
      recordOp.current = null;
      changeRecord("idle");
      if (alive.current) {
        setError(cameraError(e));
        notify(channel.current, { type: "error", message: cameraError(e) });
      }
    }
  }
  function stop(update = true) {
    abort.current?.abort();
    clearTimeout(pairTimer.current);
    stopRecording();
    notify(channel.current, { type: "end" });
    channel.current?.close();
    channel.current = null;
    closePeer(peer.current);
    peer.current = null;
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    wake.current?.release().catch(() => {});
    wake.current = null;
    leaveRoom(join, join.key);
    if (video.current) video.current.srcObject = null;
    if (update && alive.current) setStatus("ended");
  }
  useEffect(() => {
    alive.current = true;
    const unload = (e) => {
      if (
        recordState.current !== "idle" ||
        (clipRef.current && !clipRef.current.saved)
      ) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", unload);
    const visibility = () => {
      if (document.visibilityState === "visible" && stream.current)
        navigator.wakeLock
          ?.request("screen")
          .then((w) => {
            wake.current = w;
          })
          .catch(() => {});
    };
    document.addEventListener("visibilitychange", visibility);
    return () => {
      alive.current = false;
      stop(false);
      clearInterval(recordTimer.current);
      mic.current?.getTracks().forEach((t) => t.stop());
      if (clipRef.current) URL.revokeObjectURL(clipRef.current.url);
      window.removeEventListener("beforeunload", unload);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, []);
  handlers.current = { startRecording, stopRecording, stop };
  async function start() {
    if (busy.current) return;
    busy.current = true;
    setError("");
    setStatus("permission");
    const control = new AbortController();
    abort.current = control;
    try {
      // Check that the QR is still valid before requesting camera access.
      await cameraApi(`rooms/${join.id}`, {
        key: join.key,
        signal: control.signal,
      });
      if (!navigator.mediaDevices?.getUserMedia)
        throw new Error("Abre este enlace en Safari desde una conexión HTTPS.");
      const media = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          frameRate: { ideal: 30, max: 30 },
        },
        audio: false,
      });
      if (control.signal.aborted) {
        media.getTracks().forEach((t) => t.stop());
        return;
      }
      stream.current = media;
      if (video.current) {
        video.current.srcObject = media;
        video.current.play().catch(() => {});
      }
      setResolution(describe(media));
      navigator.wakeLock
        ?.request("screen")
        .then((w) => {
          if (control.signal.aborted) w.release().catch(() => {});
          else wake.current = w;
        })
        .catch(() => {});
      const cams = await navigator.mediaDevices.enumerateDevices();
      setDevices(cams.filter((d) => d.kind === "videoinput"));
      setSelectedDevice(media.getVideoTracks()[0].getSettings().deviceId || "");
      setStatus("connecting");
      const pc = makePeer();
      peer.current = pc;
      media.getVideoTracks().forEach((track) => pc.addTrack(track, media));
      const dc = pc.createDataChannel("pulso-camera");
      channel.current = dc;
      dc.onopen = () => {
        notify(dc, { type: "ready" });
        report();
      };
      dc.onmessage = (event) => {
        if (typeof event.data !== "string" || event.data.length > 200) return;
        let m;
        try {
          m = JSON.parse(event.data);
        } catch {
          return;
        }
        if (m.type === "hello") {
          notify(dc, { type: "ready" });
          report();
        }
        if (m.type === "start-recording") handlers.current.startRecording();
        if (m.type === "stop-recording") handlers.current.stopRecording();
        if (m.type === "end") handlers.current.stop();
      };
      pc.onconnectionstatechange = () => {
        if (control.signal.aborted || !alive.current) return;
        if (pc.connectionState === "connected") {
          clearTimeout(pairTimer.current);
          setStatus("connected");
          report();
        }
        if (pc.connectionState === "disconnected") setStatus("reconnecting");
        if (pc.connectionState === "failed") {
          setStatus("failed");
          setError(
            "Se perdió la conexión con la laptop. Si estabas grabando, guarda el clip aquí antes de salir.",
          );
        }
      };
      await pc.setLocalDescription(await pc.createOffer());
      await gather(pc, control.signal);
      if (!pc.localDescription.sdp.includes("a=candidate:"))
        throw new Error(
          "El navegador o la red bloqueó la conexión directa. Permite el acceso a la red local si se solicita y usa Safari en el iPhone y Chrome o Edge en Windows.",
        );
      if (control.signal.aborted) return;
      await cameraApi(`rooms/${join.id}/offer`, {
        method: "POST",
        key: join.key,
        body: {
          senderId: crypto.randomUUID().replaceAll("-", ""),
          description: { type: "offer", sdp: pc.localDescription.sdp },
        },
        signal: control.signal,
      });
      const deadline = Date.now() + 45000;
      let answer;
      while (!control.signal.aborted && Date.now() < deadline) {
        const data = await cameraApi(`rooms/${join.id}`, {
          key: join.key,
          signal: control.signal,
        });
        if (data.description) {
          answer = data.description;
          break;
        }
        await pause(1500, control.signal);
      }
      if (!answer)
        throw new Error(
          "La laptop no respondió. Mantén Pulso abierto allí y genera otro QR.",
        );
      await pc.setRemoteDescription(answer);
      pairTimer.current = setTimeout(() => {
        if (pc.connectionState !== "connected" && alive.current) {
          setStatus("failed");
          setError(
            "La red impide conectar la cámara. Usa la misma Wi-Fi, sin VPN ni red de invitados, y genera otro QR.",
          );
        }
      }, 30000);
    } catch (e) {
      if (!control.signal.aborted && alive.current) {
        stream.current?.getTracks().forEach((t) => t.stop());
        stream.current = null;
        closePeer(peer.current);
        peer.current = null;
        wake.current?.release().catch(() => {});
        setStatus("failed");
        setError(cameraError(e));
      }
    } finally {
      busy.current = false;
    }
  }
  async function switchDevice(id) {
    if (rec !== "idle" || busy.current) return;
    busy.current = true;
    setError("");
    try {
      const sender = peer.current
        ?.getSenders()
        .find((s) => s.track?.kind === "video");
      if (sender) await sender.replaceTrack(null);
      stream.current?.getTracks().forEach((t) => t.stop());
      stream.current = null;
      const media = await navigator.mediaDevices.getUserMedia({
        video: {
          deviceId: { exact: id },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          frameRate: { ideal: 30, max: 30 },
        },
        audio: false,
      });
      const track = media.getVideoTracks()[0];
      if (sender) await sender.replaceTrack(track);
      stream.current = media;
      if (video.current) {
        video.current.srcObject = media;
        video.current.play().catch(() => {});
      }
      setSelectedDevice(id);
      setResolution(describe(media));
    } catch (e) {
      setError(cameraError(e));
      stop();
    } finally {
      busy.current = false;
    }
  }
  async function share() {
    if (!clip) return;
    const file = new File([clip.blob], clip.name, { type: clip.blob.type });
    try {
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: "Mi vídeo de Pulso" });
        clipRef.current.saved = true;
        setClip({ ...clipRef.current });
      } else {
        document.getElementById("camera-download")?.click();
      }
    } catch (e) {
      if (e.name !== "AbortError")
        setError(
          "No se pudo compartir. Usa Descargar clip para guardarlo en Archivos.",
        );
    }
  }
  return (
    <div className="camera-phone">
      <section className="camera-intro">
        <div>
          <span className="eyebrow">TU IPHONE ES LA CÁMARA</span>
          <h1>Encuádrate con la trasera.</h1>
          <p>
            Abre la cámara aquí y comprueba la imagen en tu laptop. Mantén
            Safari abierto y el teléfono desbloqueado.
          </p>
        </div>
      </section>
      {error && (
        <div className="camera-error" role="alert">
          {error}
        </div>
      )}
      <section className="camera-view camera-phone-preview">
        <div className="camera-live-label">
          <span
            className={`camera-dot ${status === "connected" ? "is-live" : ""}`}
          />
          {status === "connected"
            ? "CONECTADO A TU MONITOR"
            : status === "connecting"
              ? "CONECTANDO…"
              : "VISTA DEL IPHONE"}
          {rec === "recording" && <strong>● REC {clock(seconds)}</strong>}
        </div>
        <video
          ref={video}
          autoPlay
          muted
          playsInline
          aria-label="Vista previa de la cámara trasera"
        />
        {!stream.current && (
          <div className="camera-placeholder">
            <Smartphone size={42} />
            <p>El iPhone te pedirá permiso para abrir la cámara.</p>
          </div>
        )}
        <span className="camera-resolution">{resolution}</span>
      </section>
      <section className="camera-card">
        {status === "idle" && (
          <>
            <h2>Tu laptop recibirá solo la imagen.</h2>
            <p>
              El monitor también podrá iniciar y detener la grabación opcional.
              Los clips se guardan únicamente en este dispositivo cuando los
              descargas o compartes.
            </p>
            <button className="button primary" onClick={start}>
              <Camera size={18} />
              Permitir cámara y conectar
            </button>
          </>
        )}
        {["permission", "connecting"].includes(status) && (
          <p role="status">
            {status === "permission"
              ? "Permite la cámara en Safari…"
              : "Conectando con la laptop…"}
          </p>
        )}
        {["connected", "reconnecting", "failed"].includes(status) &&
          stream.current && (
            <>
              <p className="camera-success">
                {status === "connected"
                  ? "Ya puedes comprobar el encuadre en Windows."
                  : "Comprueba la conexión de la laptop."}
              </p>
              {devices.length > 1 && (
                <label className="camera-field">
                  Cámara
                  <select
                    value={selectedDevice}
                    disabled={rec !== "idle"}
                    onChange={(e) => switchDevice(e.target.value)}
                  >
                    {devices.map((d, i) => (
                      <option key={d.deviceId} value={d.deviceId}>
                        {d.label || `Cámara ${i + 1}`}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label className="camera-check">
                <input
                  type="checkbox"
                  checked={sound}
                  disabled={rec !== "idle"}
                  onChange={(e) => setSound(e.target.checked)}
                />
                Grabar también el sonido (solo en el clip local)
              </label>
              <button
                className={`button ${rec === "recording" ? "camera-danger" : "primary"}`}
                disabled={!supported || ["preparing", "saving"].includes(rec)}
                onClick={rec === "recording" ? stopRecording : startRecording}
              >
                {rec === "recording" ? (
                  <Square size={16} />
                ) : (
                  <Circle size={16} />
                )}{" "}
                {rec === "recording"
                  ? `Detener grabación · ${clock(seconds)}`
                  : rec === "preparing"
                    ? "Permite el micrófono…"
                    : rec === "saving"
                      ? "Preparando clip…"
                      : "Grabar clip en este iPhone"}
              </button>
              <p className="camera-small">
                Hasta 3 minutos por clip. Guarda cada grabación antes de cerrar
                esta página. La vista del monitor nunca envía el sonido.
              </p>
            </>
          )}
        {!["idle", "ended"].includes(status) && (
          <button className="button white" onClick={() => stop()}>
            <X size={16} />
            Cerrar cámara y terminar
          </button>
        )}
        {status === "ended" && (
          <p>
            La cámara está cerrada. Para volver a conectar, genera un nuevo QR
            en la laptop.
          </p>
        )}
        {status === "failed" && !stream.current && (
          <p>
            Genera otro QR en la laptop y escanéalo con el iPhone para volver a
            intentarlo.
          </p>
        )}
        {clip && (
          <div className="camera-clip">
            <h2>Tu clip está listo.</h2>
            <video
              src={clip.url}
              controls
              playsInline
              preload="metadata"
              aria-label="Revisar el clip grabado"
            />
            <p>
              {Math.round((clip.blob.size / 1024 / 1024) * 10) / 10} MB ·{" "}
              {clip.blob.type.includes("mp4") ? "MP4" : "WebM"}
            </p>
            <div className="camera-clip-actions">
              <a
                id="camera-download"
                className="button primary"
                href={clip.url}
                download={clip.name}
                onClick={() => {
                  clipRef.current.saved = true;
                  setClip({ ...clipRef.current });
                }}
              >
                <Download size={17} />
                Descargar clip
              </a>
              <button className="button white" onClick={share}>
                <Share2 size={17} />
                Compartir / guardar
              </button>
            </div>
            <p className="camera-small">
              En iPhone, elige Guardar vídeo si aparece en Compartir, o guarda
              el archivo en Archivos. El clip no se ha subido a Pulso.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
