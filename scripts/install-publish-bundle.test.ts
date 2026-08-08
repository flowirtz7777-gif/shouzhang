import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import JSZip from "jszip";
import { afterEach, expect, test } from "vitest";
import type { PracticeProject } from "../src/domain/practice";
import { seedProject } from "../src/domain/seedProject";
import { installPublishBundle } from "./install-publish-bundle";

const temporaryRoots: string[] = [];
const MEBIBYTE = 1024 * 1024;

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

async function makeTemporaryTarget(): Promise<{ root: string; target: string }> {
  const root = await mkdtemp(join(tmpdir(), "practice-publish-"));
  temporaryRoots.push(root);
  return { root, target: join(root, "content") };
}

async function createValidBundle(options: { omitDisplay?: boolean } = {}): Promise<Uint8Array> {
  const zip = new JSZip();
  const project = structuredClone(seedProject);
  const asset = project.assets[0]!;
  const thumbnail = "thumbnail";
  const display = "display";
  const thumbnailPath = `assets/${asset.id}-thumbnail.webp`;
  const displayPath = `assets/${asset.id}-display.webp`;

  asset.variants.thumbnail = {
    ...asset.variants.thumbnail!,
    path: thumbnailPath,
    byteSize: thumbnail.length,
  };
  asset.variants.display = {
    ...asset.variants.display!,
    path: displayPath,
    byteSize: display.length,
  };

  zip.file("practice.json", JSON.stringify(project));
  zip.file(thumbnailPath, thumbnail);
  if (!options.omitDisplay) zip.file(displayPath, display);
  return zip.generateAsync({ type: "uint8array" });
}

function makeDescriptorHeavyProject(): PracticeProject {
  const project = structuredClone(seedProject);
  const originalAsset = project.assets[0]!;
  project.assets = Array.from({ length: 17 }, (_, index) => {
    const asset = structuredClone(originalAsset);
    if (index > 0) {
      asset.id = `00000000-0000-4000-8000-${index.toString().padStart(12, "0")}`;
    }
    asset.variants.thumbnail = {
      ...asset.variants.thumbnail!,
      path: `assets/${asset.id}-thumbnail.webp`,
      byteSize: 10 * MEBIBYTE,
    };
    asset.variants.display = {
      ...asset.variants.display!,
      path: `assets/${asset.id}-display.webp`,
      byteSize: 10 * MEBIBYTE,
    };
    return asset;
  });
  return project;
}

test.each([
  "../outside.txt",
  "..\\outside.txt",
  "/absolute.txt",
  "C:/outside.txt",
  "assets/%2e%2e/outside.txt",
])("rejects unsafe archive path %s", async (unsafePath) => {
  const zip = await JSZip.loadAsync(await createValidBundle());
  zip.file(unsafePath, "unsafe");
  const source = await zip.generateAsync({ type: "uint8array" });
  const { target } = await makeTemporaryTarget();

  await expect(installPublishBundle(source, target)).rejects.toThrow("发布包包含不安全路径");
});

test("rejects a missing manifest asset without replacing the current publish", async () => {
  const { target } = await makeTemporaryTarget();
  await mkdir(target, { recursive: true });
  await writeFile(join(target, "practice.json"), "previous-version", "utf8");

  await expect(
    installPublishBundle(await createValidBundle({ omitDisplay: true }), target),
  ).rejects.toThrow(/发布包缺少资源.*display/);
  await expect(readFile(join(target, "practice.json"), "utf8")).resolves.toBe("previous-version");
});

test("rejects publish bundles with too many entries", async () => {
  const zip = new JSZip();
  zip.file("practice.json", "{}");
  for (let index = 0; index < 1024; index += 1) {
    zip.file(`extra-${index}.txt`, "");
  }
  const { target } = await makeTemporaryTarget();

  await expect(
    installPublishBundle(await zip.generateAsync({ type: "uint8array" }), target),
  ).rejects.toThrow("ZIP 条目不能超过 1024 个");
});

test("rejects publish bundles whose manifest declares an oversized file", async () => {
  const zip = await JSZip.loadAsync(await createValidBundle());
  const project = JSON.parse(await zip.file("practice.json")!.async("string")) as PracticeProject;
  project.assets[0]!.variants.thumbnail!.byteSize = 20 * MEBIBYTE + 1;
  zip.file("practice.json", JSON.stringify(project));
  const { target } = await makeTemporaryTarget();

  await expect(
    installPublishBundle(await zip.generateAsync({ type: "uint8array" }), target),
  ).rejects.toThrow("ZIP 单个文件解压后不能超过 20 MiB");
});

test("rejects publish bundles whose manifest exceeds the cumulative extraction budget", async () => {
  const zip = new JSZip();
  zip.file("practice.json", JSON.stringify(makeDescriptorHeavyProject()));
  const { target } = await makeTemporaryTarget();

  await expect(
    installPublishBundle(await zip.generateAsync({ type: "uint8array" }), target),
  ).rejects.toThrow("ZIP 累计解压大小不能超过 320 MiB");
});

test("rejects files that are not declared by the publish manifest", async () => {
  const zip = await JSZip.loadAsync(await createValidBundle());
  zip.file("notes.txt", "not part of the publish bundle");
  const { target } = await makeTemporaryTarget();

  await expect(
    installPublishBundle(await zip.generateAsync({ type: "uint8array" }), target),
  ).rejects.toThrow("ZIP 包含清单未声明的条目：notes.txt");
});

test("installs a valid bundle below the target directory and removes stale files", async () => {
  const { target } = await makeTemporaryTarget();
  await mkdir(target, { recursive: true });
  await writeFile(join(target, "stale.txt"), "old", "utf8");

  await installPublishBundle(await createValidBundle(), target);

  const installed = JSON.parse(await readFile(join(target, "practice.json"), "utf8")) as typeof seedProject;
  const displayPath = installed.assets[0]!.variants.display!.path!;
  expect(installed.schemaVersion).toBe(1);
  await expect(readFile(join(target, displayPath), "utf8")).resolves.toBe("display");
  await expect(readFile(join(target, "stale.txt"), "utf8")).rejects.toMatchObject({ code: "ENOENT" });
});
