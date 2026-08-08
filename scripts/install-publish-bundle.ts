import { randomUUID } from "node:crypto";
import {
  mkdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import {
  basename,
  dirname,
  isAbsolute,
  relative,
  resolve,
} from "node:path";
import JSZip, { type JSZipObject } from "jszip";
import { pathToFileURL } from "node:url";
import type { AssetVariant } from "../src/domain/practice";
import { publishedProjectSchema } from "../src/domain/practiceSchema";

interface ZipEntryWithOriginalName extends JSZipObject {
  unsafeOriginalName?: string;
  _data?: {
    compressedSize?: number;
    uncompressedSize?: number;
  };
}

interface PreparedEntry {
  archivePath: string;
  destination: string;
  entry: ZipEntryWithOriginalName;
  declaredSize?: number;
  content?: Uint8Array;
}

interface ExtractionBudget {
  totalBytes: number;
}

const WINDOWS_RESERVED_NAME = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i;
const MAX_DECODE_PASSES = 8;
const MEBIBYTE = 1024 * 1024;
const MAX_ZIP_INPUT_BYTES = 320 * MEBIBYTE;
const MAX_ZIP_ENTRY_COUNT = 1024;
const MAX_ZIP_ENTRY_BYTES = 20 * MEBIBYTE;
const MAX_ZIP_UNCOMPRESSED_BYTES = 320 * MEBIBYTE;

export async function installPublishBundle(
  source: Uint8Array,
  targetDir: string,
): Promise<void> {
  assertZipInputSize(source.byteLength);
  const target = resolve(targetDir);
  const parent = dirname(target);
  if (parent === target || basename(target) === "") {
    throw new Error("发布目录不能是文件系统根目录");
  }

  const zip = await JSZip.loadAsync(source);
  const preparedEntries = prepareEntries(zip, target);
  const manifestEntry = preparedEntries.find(
    ({ archivePath, entry }) => archivePath === "practice.json" && !entry.dir,
  );
  if (!manifestEntry) throw new Error("发布包缺少 practice.json");

  const extractionBudget: ExtractionBudget = { totalBytes: 0 };
  const project = await readAndValidateManifest(manifestEntry, extractionBudget);
  validateManifestAssets(project.assets, preparedEntries);

  await mkdir(parent, { recursive: true });
  const staging = resolve(parent, `.${basename(target)}.install-${randomUUID()}`);
  const backup = resolve(parent, `.${basename(target)}.backup-${randomUUID()}`);
  assertDirectChild(parent, staging);
  assertDirectChild(parent, backup);

  try {
    await mkdir(staging, { recursive: false });
    await extractEntries(preparedEntries, target, staging, extractionBudget);
    await swapDirectories(staging, target, backup);
  } catch (error) {
    await removeOwnedDirectory(staging, parent);
    throw error;
  }
}

function prepareEntries(zip: JSZip, target: string): PreparedEntry[] {
  const zipEntries = Object.entries(zip.files);
  if (zipEntries.length > MAX_ZIP_ENTRY_COUNT) {
    throw new Error(`ZIP 条目不能超过 ${MAX_ZIP_ENTRY_COUNT} 个`);
  }

  const entries: PreparedEntry[] = [];
  const destinations = new Map<string, { path: string; directory: boolean }>();
  let totalBytes = 0;

  for (const [zipKey, value] of zipEntries) {
    const entry = value as ZipEntryWithOriginalName;
    const originalName = entry.unsafeOriginalName;
    const archivePath = normalizeArchivePath(zipKey, entry.dir);
    normalizeArchivePath(entry.name, entry.dir);
    if (originalName !== undefined) normalizeArchivePath(originalName, entry.dir);

    const destination = resolve(target, ...archivePath.split("/"));
    assertPathBelow(target, destination);

    const collisionKey = destination.toLocaleLowerCase("en-US");
    const existing = destinations.get(collisionKey);
    if (existing && (existing.path !== destination || existing.directory !== entry.dir)) {
      throw new Error(`发布包包含冲突路径：${archivePath}`);
    }
    if (existing) throw new Error(`发布包包含重复路径：${archivePath}`);
    destinations.set(collisionKey, { path: destination, directory: entry.dir });
    const declaredSize = entry.dir ? undefined : declaredEntrySize(entry);
    if (declaredSize !== undefined) {
      assertEntryByteLimit(archivePath, declaredSize);
      totalBytes = addToUncompressedTotal(totalBytes, declaredSize);
    }
    entries.push({ archivePath, destination, entry, declaredSize });
  }

  return entries;
}

function normalizeArchivePath(value: string, directory: boolean): string {
  let candidate = value;

  for (let pass = 0; pass < MAX_DECODE_PASSES; pass += 1) {
    const normalized = validateArchivePath(candidate, directory);
    let decoded: string;
    try {
      decoded = decodeURIComponent(candidate);
    } catch (error) {
      throw new Error(`发布包包含不安全路径：${value}`, { cause: error });
    }
    if (decoded === candidate) return normalized;
    candidate = decoded;
  }

  throw new Error(`发布包包含不安全路径：${value}`);
}

function validateArchivePath(value: string, directory: boolean): string {
  if (!value || value.includes("\\")) {
    throw new Error(`发布包包含不安全路径：${value}`);
  }
  if (
    value.startsWith("/")
    || isAbsolute(value)
    || /^[A-Za-z]:/.test(value)
    || /^[a-z][a-z\d+.-]*:/i.test(value)
  ) {
    throw new Error(`发布包包含不安全路径：${value}`);
  }
  if ([...value].some((character) => {
    const code = character.charCodeAt(0);
    return code < 0x20 || code === 0x7f;
  })) {
    throw new Error(`发布包包含不安全路径：${value}`);
  }

  const withoutDirectorySlash = directory ? value.replace(/\/+$/, "") : value;
  if (!withoutDirectorySlash || (!directory && value.endsWith("/"))) {
    throw new Error(`发布包包含不安全路径：${value}`);
  }

  const segments = withoutDirectorySlash.split("/");
  if (segments.some((segment) => (
    !segment
    || segment === "."
    || segment === ".."
    || /[:*?"<>|]/.test(segment)
    || /[. ]$/.test(segment)
    || WINDOWS_RESERVED_NAME.test(segment)
  ))) {
    throw new Error(`发布包包含不安全路径：${value}`);
  }

  return segments.join("/");
}

function assertZipInputSize(byteLength: number): void {
  if (!Number.isSafeInteger(byteLength) || byteLength < 0) {
    throw new Error("ZIP 输入大小无效");
  }
  if (byteLength > MAX_ZIP_INPUT_BYTES) {
    throw new Error("ZIP 压缩包不能超过 320 MiB");
  }
}

function declaredEntrySize(entry: ZipEntryWithOriginalName): number | undefined {
  const byteLength = entry._data?.uncompressedSize;
  if (byteLength === undefined) return undefined;
  if (!Number.isSafeInteger(byteLength) || byteLength < 0) {
    throw new Error(`ZIP 条目大小无效：${entry.name}`);
  }
  return byteLength;
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

function addParentDirectories(path: string, directories: Set<string>): void {
  const segments = path.split("/");
  for (let index = 1; index < segments.length; index += 1) {
    directories.add(segments.slice(0, index).join("/"));
  }
}

async function readPreparedEntry(
  prepared: PreparedEntry,
  budget: ExtractionBudget,
  cache = false,
): Promise<Uint8Array> {
  if (prepared.content) return prepared.content;

  const bytes = await prepared.entry.async("uint8array");
  assertEntryByteLimit(prepared.archivePath, bytes.byteLength);
  budget.totalBytes = addToUncompressedTotal(budget.totalBytes, bytes.byteLength);
  if (cache) prepared.content = bytes;
  return bytes;
}

async function readAndValidateManifest(
  prepared: PreparedEntry,
  budget: ExtractionBudget,
) {
  let source: unknown;
  try {
    const bytes = await readPreparedEntry(prepared, budget, true);
    source = JSON.parse(new TextDecoder().decode(bytes));
  } catch (error) {
    throw new Error("practice.json 不是有效的 JSON", { cause: error });
  }

  const result = publishedProjectSchema.safeParse(source);
  if (!result.success) {
    throw new Error("practice.json 不符合发布数据格式", { cause: result.error });
  }
  return result.data;
}

function validateManifestAssets(
  assets: Array<{ id: string; variants: Record<string, AssetVariant | undefined> }>,
  entries: PreparedEntry[],
): void {
  const filesByPath = new Map(
    entries.filter(({ entry }) => !entry.dir).map((prepared) => [prepared.archivePath, prepared]),
  );
  const allowedFiles = new Set<string>(["practice.json"]);
  const allowedDirectories = new Set<string>();
  const countedPaths = new Set<string>();
  let manifestAssetBytes = 0;

  for (const asset of assets) {
    for (const descriptor of Object.values(asset.variants)) {
      if (!descriptor?.path) continue;
      const archivePath = normalizeArchivePath(descriptor.path, false);
      allowedFiles.add(archivePath);
      addParentDirectories(archivePath, allowedDirectories);
      if (!countedPaths.has(archivePath)) {
        assertEntryByteLimit(archivePath, descriptor.byteSize);
        manifestAssetBytes = addToUncompressedTotal(manifestAssetBytes, descriptor.byteSize);
        countedPaths.add(archivePath);
      }
    }
  }

  for (const asset of assets) {
    for (const [variantName, descriptor] of Object.entries(asset.variants)) {
      if (!descriptor?.path) continue;
      const archivePath = normalizeArchivePath(descriptor.path, false);
      const prepared = filesByPath.get(archivePath);
      if (!prepared) {
        throw new Error(`发布包缺少资源 ${asset.id}:${variantName}（${archivePath}）`);
      }

      const byteLength = prepared.declaredSize;
      if (byteLength === undefined) continue;
      if (byteLength !== descriptor.byteSize) {
        throw new Error(
          `发布包资源字节数不匹配 ${asset.id}:${variantName}（清单 ${descriptor.byteSize}，文件 ${byteLength}）`,
        );
      }
    }
  }
  for (const prepared of entries) {
    const allowed = prepared.entry.dir
      ? allowedDirectories.has(prepared.archivePath)
      : allowedFiles.has(prepared.archivePath);
    if (!allowed) {
      throw new Error(`ZIP 包含清单未声明的条目：${prepared.archivePath}`);
    }
  }
}

async function extractEntries(
  entries: PreparedEntry[],
  target: string,
  staging: string,
  budget: ExtractionBudget,
): Promise<void> {
  const ordered = [...entries].sort((left, right) => Number(right.entry.dir) - Number(left.entry.dir));

  for (const prepared of ordered) {
    const suffix = relative(target, prepared.destination);
    const destination = resolve(staging, suffix);
    assertPathBelow(staging, destination);

    if (prepared.entry.dir) {
      await mkdir(destination, { recursive: true });
      continue;
    }

    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, await readPreparedEntry(prepared, budget), { flag: "wx" });
  }

  await readFile(resolve(staging, "practice.json"));
}

async function swapDirectories(staging: string, target: string, backup: string): Promise<void> {
  const hadTarget = await pathExists(target);
  let movedPrevious = false;

  try {
    if (hadTarget) {
      await rename(target, backup);
      movedPrevious = true;
    }
    await rename(staging, target);
  } catch (error) {
    if (movedPrevious) {
      try {
        if (await pathExists(target)) await rm(target, { recursive: true, force: true });
        await rename(backup, target);
      } catch (restoreError) {
        const swapMessage = error instanceof Error ? `；原替换错误：${error.message}` : "";
        const restoreMessage = restoreError instanceof Error ? `：${restoreError.message}` : "";
        throw new Error(
          `发布目录替换失败，且旧版本恢复失败${restoreMessage}${swapMessage}`,
          { cause: restoreError },
        );
      }
    }
    throw new Error("发布目录替换失败，已保留原有版本", { cause: error });
  }

  if (movedPrevious) await rm(backup, { recursive: true, force: true });
}

function assertPathBelow(root: string, candidate: string): void {
  const suffix = relative(root, candidate);
  if (!suffix || suffix === ".." || suffix.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) || isAbsolute(suffix)) {
    throw new Error(`发布包包含不安全路径：${candidate}`);
  }
}

function assertDirectChild(parent: string, candidate: string): void {
  if (dirname(candidate) !== parent || candidate === parent) {
    throw new Error("发布暂存目录超出允许范围");
  }
}

async function removeOwnedDirectory(candidate: string, parent: string): Promise<void> {
  assertDirectChild(parent, candidate);
  await rm(candidate, { recursive: true, force: true });
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") return false;
    throw error;
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

async function runCli(): Promise<void> {
  const [sourcePath, targetDir] = process.argv.slice(2);
  if (!sourcePath || !targetDir) {
    throw new Error(
      "用法：tsx scripts/install-publish-bundle.ts <发布包.zip> <目标 content 目录>",
    );
  }
  const source = new Uint8Array(await readFile(resolve(sourcePath)));
  await installPublishBundle(source, resolve(targetDir));
  console.log(`发布包已安装到 ${resolve(targetDir)}`);
}

const entryPath = process.argv[1];
if (entryPath && import.meta.url === pathToFileURL(resolve(entryPath)).href) {
  void runCli().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
