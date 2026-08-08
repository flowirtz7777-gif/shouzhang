import JSZip from "jszip";
import type { PracticeProject } from "../domain/practice";
import { seedProject } from "../domain/seedProject";
import {
  exportProjectJson,
  exportProjectZip,
  importProjectJson,
  importProjectZip,
} from "./importExport";
import { createImportPreview, describeImportError } from "./importPreview";

const imageAssetId = seedProject.assets[0]!.id;
const MEBIBYTE = 1024 * 1024;

function makeImageBlobs(): Map<string, Blob> {
  return new Map([
    [`${imageAssetId}:thumbnail`, new Blob(["thumb"], { type: "image/webp" })],
    [`${imageAssetId}:display`, new Blob(["display"], { type: "image/webp" })],
  ]);
}

async function makeValidZip(): Promise<Blob> {
  return exportProjectZip(
    seedProject,
    async (assetId, variant) => makeImageBlobs().get(`${assetId}:${variant}`),
  );
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

test("round-trips structured JSON without binary assets", async () => {
  const json = exportProjectJson(seedProject);
  const result = await importProjectJson(json, async () => undefined);

  expect(result.project.title).toBe(seedProject.title);
  expect(result.assets.size).toBe(0);
  expect(result.warnings).toContain("部分图片或录音仅保留资源索引");
  expect(result.summary).toEqual({ phases: 3, entries: 7, members: 2, images: 1, audio: 0 });
});

test("normalizes project collection order during JSON import", async () => {
  const project = structuredClone(seedProject);
  project.phases.reverse();
  project.entries.reverse();
  project.members.reverse();

  const result = await importProjectJson(JSON.stringify(project), async () => true);

  expect(result.project.phases.map((phase) => phase.order)).toEqual([0, 1, 2]);
  expect(result.project.entries.map((entry) => [entry.date, entry.dayOrder])).toEqual([
    ["2026-07-01", 0],
    ["2026-07-01", 1],
    ["2026-07-02", 0],
    ["2026-07-02", 1],
    ["2026-07-03", 0],
    ["2026-07-04", 0],
    ["2026-07-05", 0],
  ]);
  expect(result.project.members.map((member) => member.name)).toEqual(
    [...seedProject.members].sort((a, b) => a.name.localeCompare(b.name, "zh-CN")).map(({ name }) => name),
  );
});

test("reports a draft asset that has neither a local Blob nor a published path", async () => {
  const project = structuredClone(seedProject);
  delete project.assets[0]!.variants.display!.path;

  const result = await importProjectJson(JSON.stringify(project), async () => false);

  expect(result.warnings).toContain(`缺少资源 ${imageAssetId}:display`);
});

test("round-trips a ZIP with all referenced assets", async () => {
  const blobs = makeImageBlobs();
  const zip = await exportProjectZip(
    seedProject,
    async (assetId, variant) => blobs.get(`${assetId}:${variant}`),
  );
  const imported = await importProjectZip(zip);

  expect(imported.project.title).toBe(seedProject.title);
  expect(imported.project.assets[0]!.variants.display!.path).toMatch(/^assets\//);
  expect(imported.assets.size).toBe(blobs.size);
  expect(imported.warnings).toEqual([]);
});

test("round-trips recorded WebM audio with codec parameters", async () => {
  const project = structuredClone(seedProject);
  const audioId = "66666666-6666-4666-8666-666666666661";
  const audioBlob = new Blob(
    [new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0x01, 0x00, 0x00, 0x00])],
    { type: "audio/webm;codecs=opus" },
  );
  project.assets.push({
    id: audioId,
    kind: "audio",
    mimeType: audioBlob.type,
    originalName: "recording.weba",
    durationSeconds: 1,
    variants: { audio: { byteSize: audioBlob.size, mimeType: audioBlob.type } },
  });
  project.futureLetter = {
    ...(project.futureLetter ?? {
      unlockAt: "2027-07-12T09:00:00+08:00",
      message: "发布验证",
    }),
    audioAssetId: audioId,
  };
  const imageBlobs = makeImageBlobs();

  const zip = await exportProjectZip(project, async (assetId, variant) =>
    assetId === audioId ? audioBlob : imageBlobs.get(`${assetId}:${variant}`),
  );
  const imported = await importProjectZip(zip);

  expect(imported.project.assets.find((asset) => asset.id === audioId)?.variants.audio?.path)
    .toMatch(/\.weba$/);
  expect(imported.assets.get(`${audioId}:audio`)?.type).toBe("audio/webm;codecs=opus");
});

test("refuses to export a ZIP when a required asset Blob is absent", async () => {
  await expect(exportProjectZip(seedProject, async () => undefined)).rejects.toThrow(
    `缺少资源 ${imageAssetId}:thumbnail`,
  );
});

test("rejects a ZIP when an asset byte size does not match its manifest", async () => {
  const zipBlob = await exportProjectZip(
    seedProject,
    async (assetId, variant) => makeImageBlobs().get(`${assetId}:${variant}`),
  );
  const zip = await JSZip.loadAsync(await zipBlob.arrayBuffer());
  const project = JSON.parse(await zip.file("practice.json")!.async("string")) as typeof seedProject;
  project.assets[0]!.variants.display!.byteSize += 1;
  zip.file("practice.json", JSON.stringify(project));
  const tampered = await zip.generateAsync({ type: "blob", mimeType: "application/zip" });

  await expect(importProjectZip(tampered)).rejects.toThrow(/字节数不匹配/);
});

test("rejects a ZIP when an asset MIME type does not match its file extension", async () => {
  const zipBlob = await exportProjectZip(
    seedProject,
    async (assetId, variant) => makeImageBlobs().get(`${assetId}:${variant}`),
  );
  const zip = await JSZip.loadAsync(await zipBlob.arrayBuffer());
  const project = JSON.parse(await zip.file("practice.json")!.async("string")) as typeof seedProject;
  project.assets[0]!.variants.display!.mimeType = "image/png";
  zip.file("practice.json", JSON.stringify(project));
  const tampered = await zip.generateAsync({ type: "blob", mimeType: "application/zip" });

  await expect(importProjectZip(tampered)).rejects.toThrow(/MIME 类型不匹配/);
});

test("rejects a ZIP whose compressed input exceeds the package limit", async () => {
  class OversizedBlob extends Blob {
    override get size(): number {
      return 321 * MEBIBYTE;
    }
  }

  await expect(importProjectZip(new OversizedBlob(["zip"]))).rejects.toThrow(
    "ZIP 压缩包不能超过 320 MiB",
  );
});

test("rejects a ZIP with too many entries", async () => {
  const zip = new JSZip();
  zip.file("practice.json", "{}");
  for (let index = 0; index < 1024; index += 1) {
    zip.file(`extra-${index}.txt`, "");
  }

  await expect(importProjectZip(await zip.generateAsync({ type: "uint8array" }))).rejects.toThrow(
    "ZIP 条目不能超过 1024 个",
  );
});

test("rejects a ZIP whose manifest declares an oversized file", async () => {
  const project = structuredClone(seedProject);
  project.assets[0]!.variants.thumbnail!.byteSize = 20 * MEBIBYTE + 1;
  const zip = new JSZip();
  zip.file("practice.json", JSON.stringify(project));

  await expect(importProjectZip(await zip.generateAsync({ type: "uint8array" }))).rejects.toThrow(
    "ZIP 单个文件解压后不能超过 20 MiB",
  );
});

test("rejects a ZIP whose manifest exceeds the cumulative extraction budget", async () => {
  const zip = new JSZip();
  zip.file("practice.json", JSON.stringify(makeDescriptorHeavyProject()));

  await expect(importProjectZip(await zip.generateAsync({ type: "uint8array" }))).rejects.toThrow(
    "ZIP 累计解压大小不能超过 320 MiB",
  );
});

test("rejects files that are not declared by the ZIP manifest", async () => {
  const zip = await JSZip.loadAsync(await (await makeValidZip()).arrayBuffer());
  zip.file("notes.txt", "not part of the publish bundle");

  await expect(importProjectZip(await zip.generateAsync({ type: "uint8array" }))).rejects.toThrow(
    "ZIP 包含清单未声明的条目：notes.txt",
  );
});

test("builds a replacement preview and exposes validation errors", async () => {
  const result = await importProjectJson(exportProjectJson(seedProject), async () => true);
  const preview = createImportPreview(result, "json");

  expect(preview.projectTitle).toBe(seedProject.title);
  expect(preview.assetFiles).toBe(0);
  expect(describeImportError(new Error("导入失败"))).toEqual(["导入失败"]);
});
