import { test, expect } from "@playwright/test";

test("demo dashboard, filters and content details reflect the sample", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (err) => errors.push(err.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Tu radar de contenido" }),
  ).toBeVisible();
  await expect(
    page.getByText("Las cuentas y métricas son ficticias.", { exact: false }),
  ).toBeVisible();
  await expect(page.locator(".stat-value").nth(0)).toHaveText("3");
  await expect(page.locator(".stat-value").nth(1)).toHaveText("10");
  await page.getByRole("button", { name: "Ver todo el contenido" }).click();
  await page
    .getByRole("combobox", { name: "Periodo", exact: true })
    .selectOption("0");
  await expect(page.locator(".post-card")).toHaveCount(12);
  await page.getByRole("button", { name: "Carruseles", exact: true }).click();
  await expect(page.locator(".post-card")).toHaveCount(4);
  await page.getByRole("button", { name: "Todo", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Buscar contenido" })
    .fill("legumbres");
  await expect(page.locator(".post-card")).toHaveCount(1);
  await page.locator(".post-card").click();
  await expect(
    page.getByRole("heading", { name: "Detrás del contenido" }),
  ).toBeVisible();
  await expect(page.locator(".full-caption")).toContainText("legumbres");
  await expect(
    page.getByText(
      "Ejemplo ilustrativo: esta publicación no tiene enlace real.",
    ),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator("dialog")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("ideas can be developed, saved and restored after reload", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Mis ideas", exact: true }).click();
  await expect(page.locator(".idea-card")).toHaveCount(5);
  await page.getByRole("button", { name: "Desarrollar idea" }).first().click();
  await page
    .getByRole("textbox", { name: "Título de tu idea" })
    .fill("Mi receta para días de entrenamiento");
  await page
    .getByRole("textbox", { name: "Tu guion y tus notas" })
    .fill("Mostrar un ejemplo propio y revisar las fuentes.");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Guardar idea", exact: true })
    .click();
  await page.reload();
  await page.getByRole("button", { name: /^Mis ideas/ }).click();
  await page.getByRole("button", { name: /^Guardadas/ }).click();
  await expect(
    page.getByRole("heading", { name: "Mi receta para días de entrenamiento" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Desarrollar idea" }).click();
  await expect(
    page.getByRole("textbox", { name: "Tu guion y tus notas" }),
  ).toHaveValue("Mostrar un ejemplo propio y revisar las fuentes.");
});

test("missing Meta configuration is explained and cannot pretend to connect", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Conectar Instagram", exact: true })
    .click();
  await expect(
    page.getByText("Falta configurar la app de Meta", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Continuar con Meta" }),
  ).toBeDisabled();
  await expect(page.locator(".config-keys")).toContainText("META_APP_SECRET");
});

test("competitor removal and export act on the stored workspace", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Competidores", exact: true }).click();
  await page
    .getByRole("button", { name: "Eliminar a Clara Nutrición" })
    .click();
  await page
    .getByRole("button", { name: "Quitar competidor", exact: true })
    .click();
  await expect(page.locator(".competitor-card")).toHaveCount(2);
  await page.reload();
  await page.getByRole("button", { name: "Competidores", exact: true }).click();
  await expect(page.locator(".competitor-card")).toHaveCount(2);
  await page
    .getByRole("button", { name: "Datos y ajustes", exact: true })
    .click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Exportar", exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^pulso-.*\.json$/);
  const stream = await download.createReadStream();
  let output = "";
  for await (const chunk of stream) output += chunk;
  const data = JSON.parse(output);
  expect(data.accounts).toHaveLength(2);
  expect(output).not.toContain("access_token");
  expect(output).not.toContain("csrf");
});

test("a successful simulated API sync replaces demo content and persists real-shaped data", async ({
  page,
}) => {
  await page.route("**/api/instagram/status", (route) =>
    route.fulfill({
      json: {
        configured: true,
        connected: true,
        selected: "owner",
        accounts: [{ id: "owner", username: "myaccount" }],
        csrf: "synthetic-csrf",
        missing: [],
      },
    }),
  );
  await page.route("**/api/instagram/discover", async (route) => {
    expect(route.request().headers()["x-csrf-token"]).toBe("synthetic-csrf");
    expect(route.request().postDataJSON().username).toBe("nutrition.example");
    await route.fulfill({
      json: {
        id: "real-shaped-1",
        username: "nutrition.example",
        name: "Test professional",
        followers_count: 1000,
        media: {
          data: [
            {
              id: "real-post",
              caption: "Una receta de prueba",
              timestamp: new Date().toISOString(),
              media_product_type: "REELS",
              media_type: "VIDEO",
              like_count: 100,
              comments_count: 5,
              permalink: "https://www.instagram.com/reel/test/",
            },
          ],
        },
      },
    });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Competidores", exact: true }).click();
  await page
    .getByRole("button", { name: "Añadir competidor", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Usuario de Instagram" })
    .fill("nutrition.example");
  await page
    .getByRole("button", { name: "Añadir y sincronizar", exact: true })
    .click();
  await expect(page.locator(".competitor-card")).toHaveCount(1);
  await expect(
    page.getByRole("heading", { name: "Test professional" }),
  ).toBeVisible();
  await expect(page.locator(".demo-banner")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Ver contenido", exact: true })
    .click();
  await expect(page.locator(".post-card")).toHaveCount(1);
  await expect(page.locator(".post-rate")).toContainText("10,5%");
  await page.reload();
  await expect(page.locator(".stat-value").nth(0)).toHaveText("1");
});

test("API errors leave existing data intact", async ({ page }) => {
  await page.route("**/api/instagram/status", (route) =>
    route.fulfill({
      json: {
        configured: true,
        connected: true,
        selected: "owner",
        accounts: [],
        csrf: "test",
      },
    }),
  );
  await page.route("**/api/instagram/discover", (route) =>
    route.fulfill({
      status: 429,
      json: { error: "Meta ha limitado las consultas temporalmente." },
    }),
  );
  await page.goto("/");
  await page.getByRole("button", { name: "Competidores", exact: true }).click();
  await page
    .getByRole("button", { name: "Añadir competidor", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Usuario de Instagram" })
    .fill("example");
  await page
    .getByRole("button", { name: "Añadir y sincronizar", exact: true })
    .click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText("Meta ha limitado");
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("pulso-workspace-v1")).accounts.length,
    ),
  ).toBe(3);
});

test("mobile navigation and layout remain usable without horizontal overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Tu radar de contenido" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Abrir menú", exact: true }).click();
  await page.getByRole("button", { name: "Competidores", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Un ojo en tu sector" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: "/tmp/pulso-mobile.png", fullPage: true });
});

test("desktop dashboard renders without errors or overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1080 });
  await page.goto("/");
  await page.evaluate(() => document.fonts.ready);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: "/tmp/pulso-desktop.png", fullPage: true });
});

test('account discovery failures remain visible with a specific explanation', async ({ page }) => {
  await page.route('**/api/instagram/status', route => route.fulfill({ json: { configured: true, connected: false, accounts: [], missing: [], sessionMode: 'shared' } }));
  for (const [issue, message] of [
    ['no-pages', 'Meta no devolvió ninguna página a Pulso'],
    ['missing-permissions', 'Meta no concedió todos los permisos necesarios'],
    ['no-linked-instagram', 'Meta devolvió páginas, pero ninguna con un Instagram profesional accesible'],
  ]) {
    await page.goto('/?connection=' + issue);
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('alert')).toContainText(message);
    await expect(page.locator('.toast')).toHaveCount(0, { timeout: 8000 });
    await expect(dialog.getByRole('alert')).toBeVisible();
  }
});
