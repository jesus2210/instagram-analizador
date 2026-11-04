export const cameraSupported = () =>
  Boolean(window.RTCPeerConnection && window.isSecureContext);
export function parseCameraLink(hash = window.location.hash) {
  const p = new URLSearchParams(hash.replace(/^#/, "")),
    id = p.get("room"),
    key = p.get("key");
  return /^[a-f0-9]{32}$/.test(id || "") && /^[a-f0-9]{64}$/.test(key || "")
    ? { id, key }
    : null;
}
export function makePeer() {
  return new RTCPeerConnection({
    iceServers: [
      { urls: "stun:stun.cloudflare.com:3478" },
      { urls: "stun:stun.l.google.com:19302" },
    ],
    bundlePolicy: "max-bundle",
  });
}
export async function cameraApi(
  path,
  { key, body, method = "GET", signal } = {},
) {
  let response;
  try {
    response = await fetch(`/api/camera/${path}`, {
      method,
      credentials: "omit",
      headers: {
        ...(key ? { "X-Pulso-Camera": key } : {}),
        ...(method !== "GET" ? { "Content-Type": "application/json" } : {}),
      },
      ...(method !== "GET" ? { body: JSON.stringify(body || {}) } : {}),
      signal: signal || AbortSignal.timeout(15000),
    });
  } catch (e) {
    if (e.name === "AbortError") throw e;
    throw new Error("No se pudo contactar con Pulso. Comprueba la conexión.");
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const e = new Error(data.error || "No se pudo emparejar la cámara.");
    e.status = response.status;
    throw e;
  }
  return data;
}
export async function gather(peer, signal) {
  if (peer.iceGatheringState === "complete") return;
  await new Promise((resolve, reject) => {
    const done = () => {
      clearTimeout(timer);
      peer.removeEventListener("icegatheringstatechange", changed);
      signal?.removeEventListener("abort", abort);
      resolve();
    };
    const changed = () => {
      if (peer.iceGatheringState === "complete") done();
    };
    const abort = () => {
      done();
      reject(new DOMException("Cancelado", "AbortError"));
    };
    const timer = setTimeout(done, 8000);
    peer.addEventListener("icegatheringstatechange", changed);
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) abort();
  });
}
export const pause = (ms, signal) =>
  new Promise((resolve, reject) => {
    const abort = () => {
      clearTimeout(timer);
      reject(new DOMException("Cancelado", "AbortError"));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", abort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) abort();
  });
export function cameraError(error) {
  if (error.name === "NotAllowedError")
    return "Permite el acceso a la cámara en Safari y vuelve a intentarlo. Si vas a grabar con sonido, permite también el micrófono.";
  if (error.name === "NotFoundError")
    return "No se encontró una cámara disponible en este dispositivo.";
  if (error.name === "NotReadableError")
    return "Otra aplicación está usando la cámara. Ciérrala y vuelve a Pulso.";
  return error.message || "No se pudo abrir la cámara. Inténtalo de nuevo.";
}
