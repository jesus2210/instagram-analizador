import { test, expect } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
function workspace() {
  const date = new Date(Date.now() - 5 * 86400000).toISOString();
  const accounts = [
    { id: "a", username: "nutri.real", name: "Nutri Real", followers: 1000 },
  ];
  const posts = Array.from({ length: 6 }, (_, i) => ({
    id: `p${i}`,
    accountId: "a",
    caption: i === 0 ? "Receta de proteína que destaca" : "Receta con proteína",
    topic: "Proteínas y suplementos",
    format: "reel",
    likes: i === 0 ? 900 : 100,
    comments: 0,
    date,
    url: "https://www.instagram.com/reel/test/",
  }));
  return {
    version: 1,
    revision: 1,
    accounts,
    posts,
    savedIdeas: [
      {
        id: "idea",
        title: "Mi experimento",
        hook: "Prueba",
        structure: "Guion",
        notes: "",
        sourceId: "p0",
      },
    ],
    history: [],
    briefs: [],
    videoAnalyses: [],
    profile: {
      audience: "Personas con poco tiempo",
      goal: "Educar",
      tone: "Cercano",
    },
    automation: { enabled: false },
    own: null,
  };
}
async function setup(page, { ai = false } = {}) {
  let data = workspace();
  let audioReceived = false;
  await page.route("**/api/instagram/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const method = route.request().method();
    if (path.endsWith("/status"))
      return route.fulfill({
        json: {
          configured: true,
          connected: true,
          selected: "owner",
          accounts: [{ id: "owner", username: "jesus.test" }],
          csrf: "fake-csrf",
          sessionMode: "shared",
          missing: [],
        },
      });
    if (path.endsWith("/capabilities"))
      return route.fulfill({
        json: {
          ai,
          automation: true,
          persistence: true,
          usedToday: 0,
          dailyLimit: 5,
        },
      });
    if (path.endsWith("/workspace") && method === "POST") {
      const body = route.request().postDataJSON();
      expect(body.revision).toBe(data.revision);
      expect(route.request().headers()["x-csrf-token"]).toBe("fake-csrf");
      data = { ...data, ...body, revision: data.revision + 1 };
      return route.fulfill({ json: data });
    }
    if (path.endsWith("/workspace")) return route.fulfill({ json: data });
    if (path.endsWith("/brief")) {
      const brief = {
        id: "brief",
        title: "Desayuno práctico para tu semana",
        hook: "¿Sales sin desayunar?",
        script: "Enseña una opción práctica.",
        shots: ["Plano del plato"],
        cta: "Comparte tu opción",
        reason: "Referencia con mayor interacción relativa",
        sourceIds: ["p0"],
        healthChecks: ["Verificar aporte nutricional"],
        hypothesis: "Un ejemplo concreto puede facilitar la comprensión",
        createdAt: new Date().toISOString(),
      };
      data = { ...data, briefs: [brief], revision: data.revision + 1 };
      return route.fulfill({ json: brief });
    }
    if (path.endsWith("/own")) {
      data = {
        ...data,
        revision: data.revision + 1,
        own: {
          account: { id: "owner", username: "jesus.test", followers: 1000 },
          posts: data.posts,
          updatedAt: new Date().toISOString(),
          periodDays: 7,
          metrics: [{ name: "reach", value: null, available: false }],
          perPostInsights: [
            {
              postId: "p0",
              metrics: [{ name: "saved", value: 12, available: true }],
            },
          ],
        },
      };
      return route.fulfill({ json: data.own });
    }
    if (path.endsWith("/video")) {
      const body = route.request().postDataBuffer();
      audioReceived =
        body.includes(Buffer.from('name="audio"')) &&
        body.includes(Buffer.from("data:image/jpeg;base64,"));
      data.videoAnalyses = [
        {
          id: "video",
          title: "Vídeo de prueba",
          hook: "Observación del audio",
          structure: ["Inicio"],
          screenText: [],
          improvements: ["Dar un ejemplo"],
          evidence: ["Texto transcrito"],
          caveats: ["Solo tres fotogramas"],
          adaptedScript: "Propuesta propia",
          transcript: "Transcripción de prueba",
          frameCount: 3,
          createdAt: new Date().toISOString(),
        },
      ];
      return route.fulfill({ json: data.videoAnalyses[0] });
    }
    return route.fulfill({
      status: 404,
      json: { error: "Test route not configured" },
    });
  });
  return { data: () => data, audioReceived: () => audioReceived };
}
test("advanced analysis restores the owner workspace and explains the benchmark sample", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await setup(page);
  await page.goto("/");
  await expect(page.locator(".stat-value").first()).toHaveText("1");
  await page
    .getByRole("button", { name: "Análisis avanzado", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Publicaciones que destacan" }),
  ).toBeVisible();
  await expect(page.locator(".pro-reference").first()).toContainText(
    "9× su mediana",
  );
  await expect(
    page.getByText("Señal exploratoria", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(/Necesitamos dos días de mediciones/),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
test("studio makes missing AI configuration explicit without accepting a secret", async ({
  page,
}) => {
  await setup(page);
  await page.goto("/");
  await page
    .getByRole("button", { name: "Estudio creativo", exact: true })
    .click();
  await expect(
    page.getByText("IA pendiente de activar", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Generar guion con IA" }),
  ).toBeDisabled();
  await expect(page.locator("input[type=password]")).toHaveCount(0);
});
test("grounded AI brief can be saved and survives a workspace reload", async ({
  page,
}) => {
  const api = await setup(page, { ai: true });
  await page.goto("/");
  await page
    .getByRole("button", { name: "Estudio creativo", exact: true })
    .click();
  await page.getByRole("button", { name: "Generar guion con IA" }).click();
  await expect(
    page.getByRole("heading", { name: "Desayuno práctico para tu semana" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Referencias que puedes comprobar" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Guardar en Mis ideas" }).click();
  await expect.poll(() => api.data().savedIdeas.length).toBe(2);
  await page.reload();
  await page.getByRole("button", { name: /^Mis ideas/ }).click();
  await page.getByRole("button", { name: /^Guardadas/ }).click();
  await expect(
    page.getByRole("heading", { name: "Desayuno práctico para tu semana" }),
  ).toBeVisible();
});
test("owned results preserve unavailable insights and link ideas to real posts", async ({
  page,
}) => {
  await setup(page);
  await page.goto("/");
  await page
    .getByRole("button", { name: "Mi rendimiento", exact: true })
    .click();
  await page.getByRole("button", { name: "Actualizar mis resultados" }).click();
  await expect(page.getByText("No disponible", { exact: true })).toBeVisible();
  await page
    .getByRole("combobox", { name: "Publicación para Mi experimento" })
    .selectOption("p0");
  await expect(
    page.getByText("9× tu mediana comparable", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".pro-owned-metrics")).toContainText("12");
});
test("all professional sections fit a mobile viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setup(page);
  await page.goto("/");
  for (const name of [
    "Análisis avanzado",
    "Estudio creativo",
    "Mi rendimiento",
  ]) {
    await page.getByRole("button", { name: "Abrir menú", exact: true }).click();
    await page.getByRole("button", { name, exact: true }).click();
    await expect(page.locator(".pro-banner")).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
});
test("video preparation extracts audio and sampled frames before uploading", async ({
  page,
}, testInfo) => {
  test.skip(
    !existsSync("/usr/bin/ffmpeg"),
    "ffmpeg is needed to create the synthetic input fixture",
  );
  const file = testInfo.outputPath("synthetic.webm");
  execFileSync("/usr/bin/ffmpeg", [
    "-loglevel",
    "error",
    "-f",
    "lavfi",
    "-i",
    "color=c=green:s=320x240:d=2",
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=440:duration=2",
    "-c:v",
    "libvpx",
    "-c:a",
    "libopus",
    "-shortest",
    "-y",
    file,
  ]);
  const api = await setup(page, { ai: true });
  await page.goto("/");
  await page
    .getByRole("button", { name: "Estudio creativo", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Analizar un vídeo", exact: true })
    .click();
  await page
    .getByLabel("Vídeo MP4 o WebM", { exact: true })
    .setInputFiles(file);
  await page
    .getByRole("button", { name: "Analizar contenido", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Vídeo de prueba" }),
  ).toBeVisible({ timeout: 15000 });
  expect(api.audioReceived()).toBe(true);
});
