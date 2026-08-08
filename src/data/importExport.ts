import JSZip, { type JSZipObject } from "jszip";
import type {
  AssetVariant,
  AssetVariantName,
  PracticeAsset,
  PracticeProject,
} from "../domain/practice";
import { normalizeEntryOrder } from "../domain/orderEntries";
import { draftProjectSchema, publishedProjectSchema } from "../domain/practiceSchema";

export interface ImportSummary {
  phases: number;
  entries: number;
  members: number;
  images: number;
  audio: number;
}

export interface ImportResult {
  project: PracticeProject;
  assets: Map<string, Blob>;
  warnings: string[];
  summary: ImportSummary;
}

export type AssetBlobReader = (
  assetId: string,
  variant: AssetVariantName,
) => Promise<Blob | undefined>;

export type LocalAssetChecker = (key: string) => Promise<boolean | undefined>;

export const STRUCTURE_ONLY_WARNING = "部分图片或录音仅保留资源索引";

const MEBIBYTE = 1024 * 1024;
const MAX_ZIP_INPUT_BYTES = 320 * MEBIBYTE;
const MAX_ZIP_ENTRY_COUNT = 1024;
const MAX_ZIP_ENTRY_BYTES = 20 * MEBIBYTE;
const MAX_ZIP_UNCOMPRESSED_BYTES = 320 * MEBIBYTE;

interface ZipEntryWithMetadata extends JSZipObject {
  unsafeOriginalName?: string;
  _data?: {
    compressedSize?: number;
    uncompressedSize?: number;
  };
}

interface ZipReadBudget {
  totalBytes: number;
  cache: Map<string, Uint8Array>;
}

const mimeExtensions = new Map<string, string>([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
  ["audio/aac", "aac"],
  ["audio/mp4", "m4a"],
  ["audio/mpeg", "mp3"],
  ["audio/ogg", "ogg"],
  ["audio/wav", "wav"],
  ["audio/x-wav", "wav"],
  ["audio/webm", "weba"],
]);

export function exportProjectJson(project: PracticeProject): string {
  return JSON.stringify(project, null, 2);
}

export async function importProjectJson(
  source: string,
  hasLocalAsset: LocalAssetChecker,
): Promise<ImportResult> {
  const parsed = draftProjectSchema.parse(JSON.parse(source));
  const warnings = await findMissingDraftAssets(parsed, hasLocalAsset);
  const project = normalizeProjectOrder(parsed);

  return {
    project,
    assets: new Map(),
    warnings,
    summary: summarizeProject(project),
  };
}

export async function exportProjectZip(
  project: PracticeProject,
  getAssetBlob: AssetBlobReader,
): Promise<Blob> {
  const draft = normalizeProjectOrder(draftProjectSchema.parse(project));
  const exportedProject = structuredClone(draft);
  const zip = new JSZip();

  for (const asset of exportedProject.assets) {
    for (const variantName of requiredVariantNames(asset)) {
      const descriptor = asset.variants[variantName];
      if (!descriptor) throw new Error(`缺少资源描述 ${asset.id}:${variantName}`);

      const blob = await getAssetBlob(asset.id, variantName);
      if (!blob) throw new Error(`缺少资源 ${asset.id}:${variantName}`);

      const mimeType = blob.type || descriptor.mimeType;
      const extension = extensionForMimeType(mimeType);
      const path = `assets/${asset.id}-${variantName}.${extension}`;
      asset.variants[variantName] = {
        ...descriptor,
        path,
        byteSize: blob.size,
        mimeType,
      };
      zip.file(path, await blobToUint8Array(blob));
    }
  }

  const publishedProject = publishedProjectSchema.parse(exportedProject);
  zip.file("practice.json", JSON.stringify(publishedProject, null, 2));
  const bytes = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
  return new Blob([copyArrayBuffer(bytes)], { type: "application/zip" });
}

export async function importProjectZip(
  source: Blob | ArrayBuffer | Uint8Array,
): Promise<ImportResult> {
  assertZipInputSize(zipSourceByteLength(source));
  const zipSource = source instanceof Blob ? await blobToUint8Array(source) : source;
  const zip = await JSZip.loadAsync(zipSource);
  const entries = Object.values(zip.files) as ZipEntryWithMetadata[];
  assertZipEntryMetadata(entries);
  const manifestFile = zip.file("practice.json");
  if (!manifestFile || manifestFile.dir) throw new Error("发布包缺少 practice.json");

  const readBudget: ZipReadBudget = { totalBytes: 0, cache: new Map() };
  const manifestBytes = await readZipEntry(manifestFile, "practice.json", readBudget);
  const manifestSource = new TextDecoder().decode(manifestBytes);
  const parsed = publishedProjectSchema.parse(JSON.parse(manifestSource));
  const project = normalizeProjectOrder(parsed);
  assertManifestArchive(entries, project);
  const assets = new Map<string, Blob>();

  for (const asset of project.assets) {
    for (const variantName of requiredVariantNames(asset)) {
      const descriptor = asset.variants[variantName];
      if (!descriptor?.path) throw new Error(`缺少资源描述 ${asset.id}:${variantName}`);

      const file = zip.file(descriptor.path);
      if (!file || file.dir) throw new Error(`发布包缺少资源 ${asset.id}:${variantName}`);
      assertPathMimeType(descriptor.path, descriptor.mimeType, asset.id, variantName);

      const bytes = await readZipEntry(file, descriptor.path, readBudget);
      if (bytes.byteLength !== descriptor.byteSize) {
        throw new Error(
          `资源 ${asset.id}:${variantName} 字节数不匹配：清单为 ${descriptor.byteSize}，文件为 ${bytes.byteLength}`,
        );
      }

      assets.set(
        assetKey(asset.id, variantName),
        new Blob([copyArrayBuffer(bytes)], { type: descriptor.mimeType }),
      );
    }
  }

  return {
    project,
    assets,
    warnings: [],
    summary: summarizeProject(project),
  };
}

function assertZipInputSize(byteLength: number): void {
  if (!Number.isSafeInteger(byteLength) || byteLength < 0) {
    throw new Error("ZIP 输入大小无效");
  }
  if (byteLength > MAX_ZIP_INPUT_BYTES) {
    throw new Error("ZIP 压缩包不能超过 320 MiB");
  }
}

function zipSourceByteLength(source: Blob | ArrayBuffer | Uint8Array): number {
  return source instanceof Blob ? source.size : source.byteLength;
}

function assertZipEntryMetadata(entries: ZipEntryWithMetadata[]): void {
  if (entries.length > MAX_ZIP_ENTRY_COUNT) {
    throw new Error(`ZIP 条目不能超过 ${MAX_ZIP_ENTRY_COUNT} 个`);
  }

  let totalBytes = 0;
  for (const entry of entries) {
    if (entry.dir) continue;
    if (entry.unsafeOriginalName !== undefined && entry.unsafeOriginalName !== entry.name) {
      throw new Error(`ZIP 包含不安全路径：${entry.unsafeOriginalName}`);
    }
    const byteLength = declaredEntrySize(entry);
    if (byteLength === undefined) continue;
    assertEntryByteLimit(entry.name, byteLength);
    totalBytes = addToUncompressedTotal(totalBytes, byteLength);
  }
}

function declaredEntrySize(entry: ZipEntryWithMetadata): number | undefined {
  const byteLength = entry._data?.uncompressedSize;
  if (byteLength === undefined) return undefined;
  if (!Number.isSafeInteger(byteLength) || byteLength < 0) {
    throw new Error(`ZIP 条目大小无效：${entry.name}`);
  }
  return byteLength;
}

function assertManifestArchive(
  entries: ZipEntryWithMetadata[],
  project: PracticeProject,
): void {
  const filesByPath = new Map(
    entries.filter((entry) => !entry.dir).map((entry) => [entry.name, entry]),
  );
  const allowedFiles = new Set<string>(["practice.json"]);
  const allowedDirectories = new Set<string>();
  const countedPaths = new Set<string>();
  const expectedAssets: Array<{
    assetId: string;
    variantName: AssetVariantName;
    descriptor: AssetVariant & { path: string };
  }> = [];
  let manifestAssetBytes = 0;

  for (const asset of project.assets) {
    for (const variantName of requiredVariantNames(asset)) {
      const descriptor = asset.variants[variantName];
      if (!descriptor?.path) continue;
      allowedFiles.add(descriptor.path);
      addParentDirectories(descriptor.path, allowedDirectories);
      expectedAssets.push({
        assetId: asset.id,
        variantName,
        descriptor: descriptor as AssetVariant & { path: string },
      });

      if (!countedPaths.has(descriptor.path)) {
        assertEntryByteLimit(descriptor.path, descriptor.byteSize);
        manifestAssetBytes = addToUncompressedTotal(manifestAssetBytes, descriptor.byteSize);
        countedPaths.add(descriptor.path);
      }
    }
  }

  for (const { assetId, variantName, descriptor } of expectedAssets) {
    const entry = filesByPath.get(descriptor.path);
    const declaredSize = entry ? declaredEntrySize(entry) : undefined;
    if (declaredSize !== undefined && declaredSize !== descriptor.byteSize) {
      throw new Error(
        `资源 ${assetId}:${variantName} 字节数不匹配：清单为 ${descriptor.byteSize}，ZIP 条目为 ${declaredSize}`,
      );
    }
  }

  for (const entry of entries) {
    const archivePath = entry.dir ? entry.name.replace(/\/+$/, "") : entry.name;
    const originalPath = entry.unsafeOriginalName;
    if (originalPath !== undefined && originalPath !== entry.name) {
      throw new Error(`ZIP 包含不安全路径：${originalPath}`);
    }
    if (entry.dir ? !allowedDirectories.has(archivePath) : !allowedFiles.has(archivePath)) {
      throw new Error(`ZIP 包含清单未声明的条目：${entry.name}`);
    }
  }
}

function addParentDirectories(path: string, directories: Set<string>): void {
  const segments = path.split("/");
  for (let index = 1; index < segments.length; index += 1) {
    directories.add(segments.slice(0, index).join("/"));
  }
}

function assertEntryByteLimit(path: string, byteLength: number): void {
  if (!Number.isSafeInteger(byteLength) || byteLength < 0) {
    throw new Error(`ZIP 条目大小无效：${path}`);
  }
  if (byteLength > MAX_ZIP_ENTRY_BYTES) {
    throw new Error(`ZIP 单个文件解压后不能超过 20 MiB：${path}`);
  }
}

function addToUncompressedTotal(current: number, byteLength: number): number {
  const next = current + byteLength;
  if (!Number.isSafeInteger(next) || next > MAX_ZIP_UNCOMPRESSED_BYTES) {
    throw new Error("ZIP 累计解压大小不能超过 320 MiB");
  }
  return next;
}

async function readZipEntry(
  entry: JSZipObject,
  path: string,
  budget: ZipReadBudget,
): Promise<Uint8Array> {
  const cached = budget.cache.get(path);
  if (cached) return cached;

  const bytes = await entry.async("uint8array");
  assertEntryByteLimit(path, bytes.byteLength);
  budget.totalBytes = addToUncompressedTotal(budget.totalBytes, bytes.byteLength);
  budget.cache.set(path, bytes);
  return bytes;
}

export function normalizeProjectOrder(project: PracticeProject): PracticeProject {
  return {
    ...project,
    phases: [...project.phases].sort(
      (a, b) => a.order - b.order || a.id.localeCompare(b.id),
    ),
    entries: normalizeEntryOrder(project.entries),
    members: [...project.members].sort((a, b) => a.name.localeCompare(b.name, "zh-CN")),
  };
}

export function summarizeProject(project: PracticeProject): ImportSummary {
  return {
    phases: project.phases.length,
    entries: project.entries.length,
    members: project.members.length,
    images: project.assets.filter((asset) => asset.kind === "image").length,
    audio: project.assets.filter((asset) => asset.kind === "audio").length,
  };
}

async function findMissingDraftAssets(
  project: PracticeProject,
  hasLocalAsset: LocalAssetChecker,
): Promise<string[]> {
  const warnings = [STRUCTURE_ONLY_WARNING];
  for (const asset of project.assets) {
    for (const variantName of definedVariantNames(asset)) {
      const descriptor = asset.variants[variantName];
      if (!descriptor) continue;
      const exists = await hasLocalAsset(assetKey(asset.id, variantName));
      if (!exists && !descriptor.path) {
        warnings.push(`缺少资源 ${asset.id}:${variantName}`);
      }
    }
  }
  return warnings;
}

function requiredVariantNames(asset: PracticeAsset): AssetVariantName[] {
  return asset.kind === "image" ? ["thumbnail", "display"] : ["audio"];
}

function definedVariantNames(asset: PracticeAsset): AssetVariantName[] {
  return (["thumbnail", "display", "audio"] as const).filter(
    (variantName) => asset.variants[variantName] !== undefined,
  );
}

function assetKey(assetId: string, variantName: AssetVariantName): string {
  return `${assetId}:${variantName}`;
}

function extensionForMimeType(mimeType: string): string {
  const extension = mimeExtensions.get(baseMimeType(mimeType));
  if (!extension) throw new Error(`不支持的资源 MIME 类型 ${mimeType}`);
  return extension;
}

function assertPathMimeType(
  path: string,
  mimeType: AssetVariant["mimeType"],
  assetId: string,
  variantName: AssetVariantName,
): void {
  const fileName = path.split(/[\\/]/).at(-1) ?? "";
  const extensionStart = fileName.lastIndexOf(".");
  const actualExtension = extensionStart >= 0
    ? fileName.slice(extensionStart + 1).toLowerCase()
    : undefined;
  const expectedExtension = extensionForMimeType(mimeType);
  if (actualExtension !== expectedExtension) {
    throw new Error(
      `资源 ${assetId}:${variantName} MIME 类型不匹配：${mimeType} 与文件 ${path} 不一致`,
    );
  }
}

function baseMimeType(mimeType: string): string {
  return mimeType.split(";", 1)[0]!.trim().toLowerCase();
}

async function blobToUint8Array(blob: Blob): Promise<Uint8Array> {
  return new Uint8Array(await blob.arrayBuffer());
}

function copyArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}
