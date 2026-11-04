import { test, expect, chromium } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";
test("monitor is accessible without Instagram and fits a phone viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/camera");
  await expect(
    page.getByRole("heading", { name: "La cámara del iPhone, frente a ti." }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Generar QR de cámara" }),
  ).toBeVisible();
  await expect(
    page.getByText("Conectar Instagram", { exact: true }),
  ).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test("actual WebRTC sends the phone camera, records only locally and releases devices on end", async ({}, testInfo) => {
  test.setTimeout(90000);
  const managed = "/etc/chromium/policies/managed/misc.json";
  const policyBlocksDirect =
    existsSync(managed) &&
    JSON.parse(readFileSync(managed, "utf8")).WebRtcIPHandling ===
      "disable_non_proxied_udp";
  test.skip(
    policyBlocksDirect &&
      !process.env.PULSO_RTC_CHROMIUM_EXECUTABLE_PATH &&
      !process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    "Managed system Chromium blocks WebRTC UDP. Set PULSO_RTC_CHROMIUM_EXECUTABLE_PATH to a compatible test browser.",
  );
  const browser = await chromium.launch({
    executablePath:
      process.env.PULSO_RTC_CHROMIUM_EXECUTABLE_PATH ||
      process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ||
      (existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : undefined),
    args: [
      "--no-sandbox",
      "--use-fake-device-for-media-stream",
      "--use-fake-ui-for-media-stream",
      "--autoplay-policy=no-user-gesture-required",
      "--disable-features=WebRtcHideLocalIpsWithMdns",
    ],
  });
  const desktop = await browser.newContext({
    permissions: ["clipboard-read", "clipboard-write"],
  });
  const mobile = await browser.newContext({
    viewport: { width: 390, height: 844 },
    permissions: ["camera", "microphone"],
  });
  for (const ctx of [desktop, mobile])
    await ctx.addInitScript(() => {
      const Base = window.RTCPeerConnection;
      window.RTCPeerConnection = class extends Base {
        constructor(...args) {
          super(...args);
          window.__cameraPeer = this;
        }
      };
    });
  const pc = await desktop.newPage(),
    phone = await mobile.newPage();
  const errors = [];
  pc.on("pageerror", (e) => errors.push(e.message));
  phone.on("pageerror", (e) => errors.push(e.message));
  const requests = [];
  phone.on("request", (r) => {
    if (r.url().includes("/api/"))
      requests.push({ url: r.url(), type: r.headers()["content-type"] || "" });
  });
  try {
    await pc.goto("http://127.0.0.1:5173/camera");
    await pc.getByRole("button", { name: "Generar QR de cámara" }).click();
    await expect(
      pc.getByRole("img", {
        name: "QR privado para conectar la cámara del iPhone",
      }),
    ).toBeVisible();
    await pc
      .getByRole("button", { name: "Copiar enlace para el iPhone" })
      .click();
    const link = await pc.evaluate(() => navigator.clipboard.readText());
    expect(link).toContain("/camera#room=");
    await phone.goto(link);
    await expect(
      phone.getByRole("button", { name: "Permitir cámara y conectar" }),
    ).toBeVisible();
    expect(phone.url()).not.toContain("key=");
    await phone
      .getByRole("button", { name: "Permitir cámara y conectar" })
      .click();
    await expect(pc.getByText("EN DIRECTO", { exact: true })).toBeVisible({
      timeout: 45000,
    });
    await expect(
      phone.getByText("CONECTADO A TU MONITOR", { exact: true }),
    ).toBeVisible();
    await expect
      .poll(() => pc.locator("video").evaluate((v) => v.videoWidth))
      .toBeGreaterThan(0);
    const inbound = await pc
      .locator("video")
      .evaluate((v) => v.srcObject.getTracks().map((t) => t.kind));
    expect(inbound).toEqual(["video"]);
    await pc
      .getByRole("button", { name: "Reflejar vista del monitor" })
      .click();
    await expect(pc.locator("video")).toHaveClass("camera-mirrored");
    await pc
      .getByRole("button", { name: "Grabar en el iPhone", exact: true })
      .click();
    await expect(
      phone.getByRole("button", { name: /Detener grabación/ }),
    ).toBeVisible();
    await expect
      .poll(() =>
        phone.getByRole("button", { name: /Detener grabación/ }).textContent(),
      )
      .toContain("0:02");
    await pc
      .getByRole("button", { name: "Detener grabación", exact: true })
      .click();
    await expect(
      phone.getByRole("heading", { name: "Tu clip está listo." }),
    ).toBeVisible();
    const download = phone.waitForEvent("download");
    await phone.getByRole("link", { name: "Descargar clip" }).click();
    expect((await download).suggestedFilename()).toMatch(
      /^pulso-.*\.(mp4|webm)$/,
    );
    expect(
      requests.every(
        (r) => !r.type.includes("multipart") && !r.url.includes("key="),
      ),
    ).toBe(true);
    await pc.screenshot({
      path: testInfo.outputPath("monitor-connected.png"),
      fullPage: true,
    });
    await pc
      .getByRole("button", { name: "Terminar sesión", exact: true })
      .click();
    await expect(phone.getByText(/La cámara está cerrada/)).toBeVisible();
    expect(
      await phone
        .getByLabel("Vista previa de la cámara trasera", { exact: true })
        .evaluate((v) => v.srcObject),
    ).toBeNull();
    expect(errors).toEqual([]);
  } catch (e) {
    for (const [name, page] of [
      ["viewer", pc],
      ["sender", phone],
    ]) {
      console.log(name, await page.locator(".camera-error").allTextContents());
      console.log(
        name,
        await page.evaluate(async () => {
          const p = window.__cameraPeer;
          if (!p) return { peer: false };
          const stats = await p.getStats();
          return {
            connection: p.connectionState,
            ice: p.iceConnectionState,
            gathering: p.iceGatheringState,
            signaling: p.signalingState,
            localCandidates:
              p.localDescription?.sdp.match(/a=candidate:/g)?.length || 0,
            remoteCandidates:
              p.remoteDescription?.sdp.match(/a=candidate:/g)?.length || 0,
            stats: [...stats.values()]
              .filter((s) =>
                [
                  "candidate-pair",
                  "local-candidate",
                  "remote-candidate",
                ].includes(s.type),
              )
              .map((s) => ({
                type: s.type,
                candidateType: s.candidateType,
                state: s.state,
                protocol: s.protocol,
                bytesReceived: s.bytesReceived,
                bytesSent: s.bytesSent,
              })),
          };
        }),
      );
    }
    throw e;
  } finally {
    await browser.close();
  }
});

test("an incomplete camera link is rejected without requesting camera permissions", async ({
  page,
}) => {
  await page.goto("/camera#room=broken&key=broken");
  await expect(
    page.getByRole("heading", { name: "Este enlace de cámara no es válido." }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Permitir cámara y conectar" }),
  ).toHaveCount(0);
});

test("camera module opens inside Pulso independently of Meta and demonstration data", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Monitor de cámara", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "La cámara del iPhone, frente a ti." }),
  ).toBeVisible();
  await expect(page.locator(".demo-banner")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Conectar Instagram", exact: true }),
  ).not.toBeVisible();
  await expect(
    page.getByRole("button", { name: "Generar QR de cámara" }),
  ).toBeVisible();
});
