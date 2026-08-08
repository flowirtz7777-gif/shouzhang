import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium, type Page } from "@playwright/test";

const baseUrl = (process.argv[2] ?? "http://127.0.0.1:5173").replace(/\/$/, "");
const outputDirectory = fileURLToPath(new URL("../docs/screenshots/", import.meta.url));
const firstEntryId = "22222222-2222-4222-8222-222222222221";
const longFormEntryId = "22222222-2222-4222-8222-222222222223";

async function waitForVisuals(page: Page): Promise<void> {
  await page.waitForLoadState("networkidle");
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(
      [...document.images].map((image) => image.complete
        ? Promise.resolve()
        : new Promise<void>((resolve) => {
            image.addEventListener("load", () => resolve(), { once: true });
            image.addEventListener("error", () => resolve(), { once: true });
          })),
    );
  });
  await page.waitForTimeout(1400);
}

async function capture(page: Page, name: string): Promise<void> {
  const path = `${outputDirectory}/${name}`;
  await page.screenshot({ path, fullPage: false });
  console.log(`Captured ${path}`);
}

await mkdir(outputDirectory, { recursive: true });
const browser = await chromium.launch();

try {
  const context = await browser.newContext({
    viewport: { width: 1600, height: 1000 },
    deviceScaleFactor: 1.5,
    colorScheme: "light",
  });
  const page = await context.newPage();

  await page.goto(`${baseUrl}/?search=${encodeURIComponent("溪口村实践队")}`);
  await page.getByRole("heading", { name: "发现真实的实践足迹" }).waitFor();
  await page.getByRole("article").first().waitFor();
  await waitForVisuals(page);
  await capture(page, "platform-discovery.png");

  await page.getByRole("button", { name: "开发不易，请作者喝杯咖啡" }).click();
  await page.getByRole("dialog", { name: "开发不易，请作者喝杯咖啡" }).waitFor();
  await waitForVisuals(page);
  await capture(page, "support-dialog.png");
  await page.getByRole("button", { name: "关闭赞赏码" }).click();

  await page.goto(`${baseUrl}/@xikou-practice-team/seven-station-journey`);
  await page.getByRole("heading", { name: "我们的实践手账" }).waitFor();
  await waitForVisuals(page);
  await capture(page, "journal-overview.png");

  await page.goto(`${baseUrl}/login`);
  await page.getByLabel("邮箱").fill("demo@example.com");
  await page.locator('input[name="password"]').fill("Demo-pass-2026!");
  await page.getByRole("button", { name: "进入手账室" }).click();
  await page.waitForURL(/\/dashboard$/);
  await page.getByRole("heading", { name: "我的手账" }).waitFor();
  await waitForVisuals(page);
  await capture(page, "team-dashboard.png");

  await page.getByRole("link", { name: "编辑", exact: true }).first().click();
  await page.getByRole("button", { name: "编辑内容" }).click();
  await page.getByRole("dialog", { name: "内容编辑器" }).waitFor();
  await waitForVisuals(page);
  await capture(page, "cloud-editor.png");

  await page.goto(`${baseUrl}/#/journey`);
  await page.locator(".road-bus").waitFor();
  await waitForVisuals(page);
  await capture(page, "journey-road.png");

  await page.goto(`${baseUrl}/#/journal/${firstEntryId}`);
  await page.locator(".practice-book").waitFor();
  await waitForVisuals(page);
  await capture(page, "journal-book.png");

  await page.goto(`${baseUrl}/#/journal/${longFormEntryId}`);
  await page.locator(".practice-book").waitFor();
  await waitForVisuals(page);
  await capture(page, "journal-long-form.png");

  await page.goto(`${baseUrl}/#/journey`);
  await page.getByRole("button", { name: "编辑内容" }).click();
  await page.getByRole("dialog", { name: "内容编辑器" }).waitFor();
  await waitForVisuals(page);
  await capture(page, "content-editor.png");

  await context.close();

  const mobileContext = await browser.newContext({
    viewport: { width: 430, height: 932 },
    deviceScaleFactor: 2,
    colorScheme: "light",
    isMobile: true,
    hasTouch: true,
  });
  const mobilePage = await mobileContext.newPage();
  await mobilePage.goto(`${baseUrl}/?search=${encodeURIComponent("溪口村实践队")}`);
  await mobilePage.getByRole("heading", { name: "发现真实的实践足迹" }).waitFor();
  await waitForVisuals(mobilePage);
  await capture(mobilePage, "platform-mobile.png");
  await mobilePage.getByRole("button", { name: "开发不易，请作者喝杯咖啡" }).click();
  await mobilePage.getByRole("dialog", { name: "开发不易，请作者喝杯咖啡" }).waitFor();
  await waitForVisuals(mobilePage);
  await capture(mobilePage, "support-dialog-mobile.png");
  await mobileContext.close();
} finally {
  await browser.close();
}
