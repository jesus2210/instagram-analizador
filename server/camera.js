import express from "express";
import { randomBytes, createHash, timingSafeEqual } from "node:crypto";
import { MetaError } from "./meta.js";
const TTL = 300;
const digest = (value) => createHash("sha256").update(value).digest("hex");
const same = (value, hash) =>
  typeof value === "string" &&
  /^[a-f0-9]{64}$/.test(value) &&
  timingSafeEqual(Buffer.from(digest(value)), Buffer.from(hash));
const notFound = () =>
  new MetaError(
    "Este enlace ha caducado o no es válido. Genera un nuevo QR en la laptop.",
    404,
  );
function description(body, type) {
  if (
    body?.type !== type ||
    typeof body?.sdp !== "string" ||
    body.sdp.length > 60000 ||
    !body.sdp.startsWith("v=0\r\n") ||
    !body.sdp.includes("m=video ") ||
    !body.sdp.includes("a=fingerprint:sha-256 ")
  )
    throw new MetaError(
      "La conexión de cámara no es válida. Vuelve a emparejar.",
      400,
    );
  return { type, sdp: body.sdp };
}
export function cameraRouter({ store, publicUrl, now = Date.now }) {
  const router = express.Router();
  router.use((req, res, next) => {
    res.set({
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
    });
    if (req.method !== "GET") {
      const origin = req.get("origin");
      const expected = publicUrl
        ? new URL(publicUrl).origin
        : `${req.protocol}://${req.get("host")}`;
      if (origin && origin !== expected)
        return next(
          new MetaError(
            "Abre la cámara desde la misma dirección de Pulso.",
            403,
          ),
        );
      if (!req.is("application/json"))
        return next(new MetaError("Solicitud de cámara no válida.", 400));
    }
    next();
  });
  router.post("/rooms", async (req, res) => {
    if (process.env.VERCEL && !store.shared)
      throw new MetaError(
        "El emparejamiento temporal no está disponible. Revisa el almacén compartido del servidor.",
        503,
      );
    const mode = req.body?.mode ?? "camera";
    if (!["camera", "screen"].includes(mode))
      throw new MetaError(
        "Selecciona cámara del navegador o pantalla del iPhone.",
        400,
      );
    const address =
      req.get("x-vercel-forwarded-for") ||
      req.socket.remoteAddress ||
      "unknown";
    if (!(await store.acquire(`camera:rate:${digest(address)}`, 15)))
      throw new MetaError("Espera 15 segundos antes de generar otro QR.", 429);
    const id = randomBytes(16).toString("hex"),
      viewerKey = randomBytes(32).toString("hex"),
      senderKey = randomBytes(32).toString("hex");
    const expiresAt = now() + TTL * 1000;
    await store.put(
      `camera:room:${id}`,
      {
        mode,
        viewerHash: digest(viewerKey),
        senderHash: digest(senderKey),
        expiresAt,
        offer: null,
        answer: null,
        senderId: null,
      },
      TTL,
    );
    res.status(201).json({ id, viewerKey, senderKey, expiresAt });
  });
  router.use("/rooms/:id", async (req, res, next) => {
    try {
      if (!/^[a-f0-9]{32}$/.test(req.params.id)) throw notFound();
      const room = await store.get(`camera:room:${req.params.id}`);
      if (!room || room.expiresAt <= now()) throw notFound();
      const key = req.get("x-pulso-camera");
      const role = same(key, room.viewerHash)
        ? "viewer"
        : same(key, room.senderHash)
          ? "sender"
          : null;
      if (!role) throw notFound();
      req.camera = { room, role, id: req.params.id };
      next();
    } catch (e) {
      next(e);
    }
  });
  router.get("/rooms/:id", async (req, res) => {
    const { room, role } = req.camera;
    res.json({
      mode: room.mode || "camera",
      expiresAt: room.expiresAt,
      description: role === "viewer" ? room.offer : room.answer,
      claimed: Boolean(room.senderId),
    });
  });
  async function mutate(req, fn) {
    const { id } = req.camera,
      lock = `camera:lock:${id}`;
    if (!(await store.acquire(lock, 45)))
      throw new MetaError(
        "La cámara se está conectando. Inténtalo otra vez en unos segundos.",
        409,
      );
    try {
      const room = await store.get(`camera:room:${id}`);
      if (!room || room.expiresAt <= now()) throw notFound();
      await fn(room);
      await store.put(
        `camera:room:${id}`,
        room,
        Math.max(1, Math.ceil((room.expiresAt - now()) / 1000)),
      );
    } finally {
      await store.delete(lock);
    }
  }
  router.post("/rooms/:id/offer", async (req, res) => {
    if (req.camera.role !== "sender")
      throw new MetaError(
        "Usa el QR desde el iPhone para enviar la cámara.",
        403,
      );
    if (!/^[a-f0-9]{32}$/.test(req.body?.senderId || ""))
      throw new MetaError("La sesión del iPhone no es válida.", 400);
    const source = req.body?.source ?? "camera";
    if (source !== (req.camera.room.mode || "camera"))
      throw new MetaError(
        "El emisor no corresponde al modo del monitor. Genera un QR del modo correcto.",
        400,
      );
    const offer = description(req.body?.description, "offer");
    await mutate(req, (room) => {
      if (room.senderId && room.senderId !== req.body.senderId)
        throw new MetaError(
          "Este QR ya está en uso en otro dispositivo. Genera uno nuevo.",
          409,
        );
      if (room.answer && room.offer?.sdp !== offer.sdp)
        throw new MetaError(
          "Esta conexión ya está emparejada. Genera un nuevo QR.",
          409,
        );
      room.senderId = req.body.senderId;
      room.offer = offer;
    });
    res.json({ ok: true });
  });
  router.post("/rooms/:id/answer", async (req, res) => {
    if (req.camera.role !== "viewer")
      throw new MetaError("La respuesta debe enviarse desde la laptop.", 403);
    const answer = description(req.body?.description, "answer");
    await mutate(req, (room) => {
      if (!room.offer)
        throw new MetaError("Todavía no hay un iPhone conectado.", 409);
      if (room.answer && room.answer.sdp !== answer.sdp)
        throw new MetaError(
          "Este QR ya tiene un monitor conectado. Genera uno nuevo.",
          409,
        );
      room.answer = answer;
    });
    res.json({ ok: true });
  });
  router.delete("/rooms/:id", async (req, res) => {
    await mutate(req, (room) => {
      room.expiresAt = now();
      room.offer = null;
      room.answer = null;
    });
    await store.delete(`camera:room:${req.camera.id}`);
    res.json({ ok: true });
  });
  return router;
}
