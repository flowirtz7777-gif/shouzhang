import type { AssetVariantName } from "../domain/practice";

import { publicUrl } from "./publicPaths";

export const MISSING_ASSET_PATH = publicUrl("ui-assets/missing-image.webp");

export interface ResolveAssetInput {
  assetId: string;
  variant: AssetVariantName;
  localBlob: (assetId: string, variant: AssetVariantName) => Promise<Blob | undefined>;
  publishedPath?: string;
}

const objectUrls = new Set<string>();

export async function resolveAssetUrl(input: ResolveAssetInput): Promise<string> {
  const blob = await input.localBlob(input.assetId, input.variant);
  if (blob) {
    const url = URL.createObjectURL(blob);
    objectUrls.add(url);
    return url;
  }
  if (input.publishedPath) return input.publishedPath;
  return MISSING_ASSET_PATH;
}

export function revokeResolvedAssetUrl(url: string): void {
  if (!objectUrls.has(url)) return;
  URL.revokeObjectURL(url);
  objectUrls.delete(url);
}

export function revokeAllResolvedAssetUrls(): void {
  objectUrls.forEach((url) => URL.revokeObjectURL(url));
  objectUrls.clear();
}
