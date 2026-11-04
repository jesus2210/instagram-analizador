// Extract only the audio and three small frames in the browser: the original video stays local.
export async function prepareVideo(file, onProgress, signal) {
  if (!file || !file.type.startsWith("video/"))
    throw new Error("Selecciona un vídeo MP4 o WebM.");
  if (file.size > 100 * 1024 * 1024)
    throw new Error("El vídeo debe pesar menos de 100 MB.");
  if (
    !window.MediaRecorder ||
    !(window.AudioContext || window.webkitAudioContext)
  )
    throw new Error(
      "Este navegador no permite extraer audio. Usa Chrome o pega una transcripción.",
    );
  const url = URL.createObjectURL(file),
    video = document.createElement("video");
  const Audio = window.AudioContext || window.webkitAudioContext;
  const context = new Audio();
  let recorder;
  try {
    video.src = url;
    video.playsInline = true;
    video.preload = "auto";
    const aborted = () => {
      video.pause();
      recorder?.state === "recording" && recorder.stop();
    };
    signal?.addEventListener("abort", aborted, { once: true });
    await context.resume();
    await new Promise((resolve, reject) => {
      video.onloadedmetadata = resolve;
      video.onerror = () =>
        reject(
          new Error(
            "No se pudo leer el vídeo. Usa MP4/WebM o pega su transcripción.",
          ),
        );
      const timer = setTimeout(
        () => reject(new Error("El vídeo tardó demasiado en cargar.")),
        15000,
      );
      video.addEventListener("loadedmetadata", () => clearTimeout(timer), {
        once: true,
      });
    });
    if (
      !Number.isFinite(video.duration) ||
      video.duration > 180 ||
      video.duration < 1
    )
      throw new Error("Usa un vídeo de entre 1 y 180 segundos.");
    if (signal?.aborted) throw new Error("Análisis cancelado.");
    const source = context.createMediaElementSource(video),
      destination = context.createMediaStreamDestination();
    source.connect(destination);
    const mime = ["audio/webm;codecs=opus", "audio/mp4"].find((t) =>
      MediaRecorder.isTypeSupported(t),
    );
    if (!mime)
      throw new Error(
        "El navegador no puede grabar este audio. Pega la transcripción como alternativa.",
      );
    recorder = new MediaRecorder(destination.stream, {
      mimeType: mime,
      audioBitsPerSecond: 64000,
    });
    const chunks = [],
      frames = [],
      canvas = document.createElement("canvas");
    canvas.width = 384;
    canvas.height =
      Math.round((384 * video.videoHeight) / video.videoWidth) || 512;
    if (canvas.height > 720) {
      canvas.height = 720;
      canvas.width = Math.round((720 * video.videoWidth) / video.videoHeight);
    }
    const frameTimes = [
      0.3,
      Math.min(3, video.duration / 3),
      Math.min(12, video.duration * 0.7),
    ];
    video.ontimeupdate = () => {
      onProgress(
        Math.min(99, Math.round((video.currentTime / video.duration) * 100)),
      );
      if (frames.length < 3 && video.currentTime >= frameTimes[frames.length]) {
        try {
          canvas
            .getContext("2d")
            .drawImage(video, 0, 0, canvas.width, canvas.height);
          const frame = canvas.toDataURL("image/jpeg", 0.55);
          if (frame.length < 60000) frames.push(frame);
        } catch {}
      }
    };
    recorder.ondataavailable = (e) => {
      if (e.data.size) chunks.push(e.data);
    };
    const audio = await new Promise((resolve, reject) => {
      let timer;
      const fail = () => {
        clearTimeout(timer);
        reject(
          new Error("No se pudo extraer el audio. Pega una transcripción."),
        );
      };
      recorder.onerror = fail;
      video.onerror = fail;
      recorder.onstop = () => {
        clearTimeout(timer);
        if (signal?.aborted) return reject(new Error("Análisis cancelado."));
        resolve(new Blob(chunks, { type: mime.split(";")[0] }));
      };
      video.onended = () => {
        if (recorder.state === "recording") recorder.stop();
      };
      recorder.start(1000);
      video.play().catch(fail);
      timer = setTimeout(
        () => {
          video.pause();
          if (recorder.state === "recording") recorder.stop();
          reject(
            new Error("La extracción tardó demasiado. Pega una transcripción."),
          );
        },
        (video.duration + 20) * 1000,
      );
    });
    if (audio.size > 3 * 1024 * 1024 || audio.size < 100)
      throw new Error("No se obtuvo un audio válido de menos de 3 MB.");
    return { audio, frames, extension: mime.includes("webm") ? "webm" : "mp4" };
  } finally {
    video.pause();
    video.removeAttribute("src");
    video.load();
    if (recorder?.state === "recording") recorder.stop();
    await context.close();
    URL.revokeObjectURL(url);
  }
}
