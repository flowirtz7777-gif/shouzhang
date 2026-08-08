import type { PracticeAsset } from "../../domain/practice";
import type { ProcessImageResult } from "../../media/imageProcessor";

export interface PreparedImage {
  asset: PracticeAsset;
  blobs: Map<string, Blob>;
}

export type EditorImageProcessor = (
  file: File,
) => Promise<PreparedImage | ProcessImageResult>;

export type AssetBlobHandler = (
  asset: PracticeAsset,
  blobs: Map<string, Blob>,
) => void | Promise<void>;

export function createEditorUuid(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (character) => {
    const random = Math.floor(Math.random() * 16);
    const value = character === "x" ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

export async function prepareEditorImage(
  file: File,
  processor: EditorImageProcessor,
): Promise<PreparedImage> {
  const result = await processor(file);
  if ("asset" in result) return result;
  if (!result.ok) throw new Error(result.error);

  const id = createEditorUuid();
  const asset: PracticeAsset = {
    id,
    kind: "image",
    mimeType: "image/webp",
    originalName: file.name,
    width: result.original.width,
    height: result.original.height,
    variants: {
      thumbnail: {
        byteSize: result.thumbnail.byteSize,
        mimeType: result.thumbnail.mimeType,
        width: result.thumbnail.width,
        height: result.thumbnail.height,
      },
      display: {
        byteSize: result.display.byteSize,
        mimeType: result.display.mimeType,
        width: result.display.width,
        height: result.display.height,
      },
    },
  };
  return {
    asset,
    blobs: new Map([
      [`${id}:thumbnail`, result.thumbnail.blob],
      [`${id}:display`, result.display.blob],
    ]),
  };
}

export function mergeAssets(
  current: PracticeAsset[],
  additions: PracticeAsset[],
): PracticeAsset[] {
  const byId = new Map(current.map((asset) => [asset.id, asset]));
  additions.forEach((asset) => byId.set(asset.id, asset));
  return [...byId.values()];
}
