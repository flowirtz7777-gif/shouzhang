import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { cp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { dirname, relative, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { chromium, type Browser } from "@playwright/test";
import { exportProjectZip } from "../src/data/importExport";
import type { AssetVariant } from "../src/domain/practice";
import { publishedProjectSchema } from "../src/domain/practiceSchema";
import { seedProject } from "../src/domain/seedProject";
import { installPublishBundle } from "./install-publish-bundle";

const projectRoot = resolve(process.cwd());
const publishRoot = resolve(projectRoot, "test-results", "publish");
const publicDir = resolve(publishRoot, "public");
const contentDir = resolve(publicDir, "content");
const distDir = resolve(publishRoot, "dist");
const relativeDistDir = relative(projectRoot, distDir).replaceAll("\\", "/");
const verificationAudioId = "66666666-6666-4666-8666-666666666661";

async function main(): Promise<void> {
  assertOwnedPublishRoot(publishRoot);
  await rm(publishRoot, { recursive: true, force: true });

  let browser: Browser | undefined;
  let preview: ChildProcess | undefined;

  try {
    await cp(resolve(projectRoot, "public"), publicDir, { recursive: true });
    const sampleBytes = await readFile(
      resolve(projectRoot, "public", "content", "assets", "sample-photo.webp"),
    );
    const sampleBlob = new Blob([copyArrayBuffer(sampleBytes)], { type: "image/webp" });
    const audioBytes = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0x01, 0x00, 0x00, 0x00]);
    const audioBlob = new Blob([audioBytes], { type: "audio/webm;codecs=opus" });
    const verificationProject = structuredClone(seedProject);
    verificationProject.assets.push({
      id: verificationAudioId,
      kind: "audio",
      mimeType: audioBlob.type,
      originalName: "future-letter.weba",
      durationSeconds: 1,
      variants: {
        audio: { byteSize: audioBlob.size, mimeType: audioBlob.type },
      },
    });
    verificationProject.futureLetter = {
      ...(verificationProject.futureLetter ?? {
        unlockAt: "2027-07-12T09:00:00+08:00",
        message: "发布验证",
      }),
      audioAssetId: verificationAudioId,
    };
    const publishBundle = await exportProjectZip(
      verificationProject,
      async (assetId) => assetId === verificationAudioId ? audioBlob : sampleBlob,
    );
    await installPublishBundle(new Uint8Array(await publishBundle.arrayBuffer()), contentDir);

    const environment = {
      ...process.env,
      PUBLISH_VERIFY_PUBLIC_DIR: publicDir,
    };
    await runBuild(environment);

    const port = await reservePort();
    preview = startPreview(port, environment);
    const baseUrl = `http://127.0.0.1:${port}`;
    await waitForPreview(baseUrl, preview);

    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();

    await requirePage(page.goto(`${baseUrl}/#/journey`, { waitUntil: "domcontentloaded" }), "旅途公路");
    await page.getByRole("main").waitFor();
    const entry = seedProject.entries[0]!;
    await requirePage(
      page.goto(`${baseUrl}/#/journal/${entry.id}`, { waitUntil: "domcontentloaded" }),
      "手账深链接",
    );
    await page.getByRole("main").getByText(entry.title).first().waitFor();
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.getByRole("main").getByText(entry.title).first().waitFor();

    const manifestResponse = await context.request.get(`${baseUrl}/content/practice.json`);
    assertHttpOk(manifestResponse.status(), "content/practice.json");
    const project = publishedProjectSchema.parse(await manifestResponse.json());
    const resources = collectResources(project.assets);
    if (resources.size === 0) throw new Error("发布清单没有可验证的图片或录音资源");

    for (const [path, descriptor] of resources) {
      const response = await context.request.get(new URL(`/content/${path}`, baseUrl).toString());
      assertHttpOk(response.status(), path);
      const body = await response.body();
      if (body.byteLength !== descriptor.byteSize) {
        throw new Error(`发布资源字节数不匹配：${path}`);
      }
      const responseMime = baseMimeType(response.headers()["content-type"] ?? "");
      const expectedMime = baseMimeType(descriptor.mimeType);
      if (responseMime !== expectedMime) {
        throw new Error(
          `发布资源 MIME 类型不匹配：${path}（期望 ${expectedMime}，实际 ${responseMime || "缺失"}）`,
        );
      }
    }

    console.log(`发布验证通过：2 个页面，${resources.size} 个媒体资源。`);
  } finally {
    try {
      await browser?.close();
    } finally {
      try {
        if (preview) await stopProcess(preview);
      } finally {
        assertOwnedPublishRoot(publishRoot);
        await rm(publishRoot, { recursive: true, force: true });
      }
    }
  }
}

function collectResources(
  assets: Array<{ variants: Record<string, AssetVariant | undefined> }>,
): Map<string, AssetVariant> {
  const resources = new Map<string, AssetVariant>();
  for (const asset of assets) {
    for (const descriptor of Object.values(asset.variants)) {
      if (!descriptor?.path) continue;
      const existing = resources.get(descriptor.path);
      if (
        existing
        && (existing.byteSize !== descriptor.byteSize || existing.mimeType !== descriptor.mimeType)
      ) {
        throw new Error(`发布清单对同一路径给出了冲突描述：${descriptor.path}`);
      }
      resources.set(descriptor.path, descriptor);
    }
  }
  return resources;
}

async function runBuild(environment: NodeJS.ProcessEnv): Promise<void> {
  const child = process.platform === "win32"
    ? spawn(
      process.env.ComSpec ?? "C:\\Windows\\System32\\cmd.exe",
      ["/d", "/s", "/c", `npm.cmd run build -- --outDir ${relativeDistDir} --emptyOutDir`],
      { cwd: projectRoot, env: environment, stdio: "inherit" },
    )
    : spawn(
      "npm",
      ["run", "build", "--", "--outDir", relativeDistDir, "--emptyOutDir"],
      { cwd: projectRoot, env: environment, stdio: "inherit" },
    );

  const [code, signal] = await once(child, "exit") as [number | null, NodeJS.Signals | null];
  if (code !== 0) {
    throw new Error(`生产构建失败（退出码 ${code ?? "无"}，信号 ${signal ?? "无"}）`);
  }
}

function startPreview(port: number, environment: NodeJS.ProcessEnv): ChildProcess {
  const viteBin = resolve(projectRoot, "node_modules", "vite", "bin", "vite.js");
  const child = spawn(
    process.execPath,
    [
      viteBin,
      "preview",
      "--host",
      "127.0.0.1",
      "--port",
      String(port),
      "--strictPort",
      "--outDir",
      relativeDistDir,
    ],
    { cwd: projectRoot, env: environment, stdio: ["ignore", "pipe", "pipe"] },
  );
  child.stdout?.pipe(process.stdout);
  child.stderr?.pipe(process.stderr);
  return child;
}

async function reservePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolvePromise, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolvePromise());
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    server.close();
    throw new Error("无法分配发布验证端口");
  }
  const port = address.port;
  await new Promise<void>((resolvePromise, reject) => {
    server.close((error) => (error ? reject(error) : resolvePromise()));
  });
  return port;
}

async function waitForPreview(baseUrl: string, preview: ChildProcess): Promise<void> {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (hasExited(preview)) {
      throw new Error(
        `Vite 预览服务提前退出，退出码 ${preview.exitCode ?? "无"}，信号 ${preview.signalCode ?? "无"}`,
      );
    }
    try {
      const response = await fetch(baseUrl);
      if (response.ok) return;
    } catch {
      // The preview server is still starting.
    }
    await delay(250);
  }
  throw new Error("等待 Vite 预览服务超时");
}

async function stopProcess(child: ChildProcess): Promise<void> {
  if (hasExited(child)) return;
  const exit = once(child, "exit");
  child.kill();
  await Promise.race([exit, delay(5_000)]);
  if (!hasExited(child)) {
    const forcedExit = once(child, "exit");
    child.kill("SIGKILL");
    await forcedExit;
  }
}

function hasExited(child: ChildProcess): boolean {
  return child.exitCode !== null || child.signalCode !== null;
}

async function requirePage(
  navigation: ReturnType<import("@playwright/test").Page["goto"]>,
  label: string,
): Promise<void> {
  const response = await navigation;
  if (!response) return;
  assertHttpOk(response.status(), label);
}

function assertHttpOk(status: number, label: string): void {
  if (status < 200 || status >= 300) {
    throw new Error(`${label} 请求失败，HTTP ${status}`);
  }
}

function assertOwnedPublishRoot(candidate: string): void {
  const expected = resolve(projectRoot, "test-results", "publish");
  if (resolve(candidate) !== expected || dirname(expected) !== resolve(projectRoot, "test-results")) {
    throw new Error("拒绝清理非发布验证目录");
  }
}

function copyArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

function baseMimeType(value: string): string {
  return value.split(";", 1)[0]!.trim().toLowerCase();
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exitCode = 1;
});
