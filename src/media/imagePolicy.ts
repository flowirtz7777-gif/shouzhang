const MAX_BYTES = 20 * 1024 * 1024;
const MAX_PIXELS = 40_000_000;
const MAX_LONG_EDGE = 1600;
const MAX_PROJECT_BYTES = 300 * 1024 * 1024;

export interface ImageSourceInfo {
  bytes: number;
  width: number;
  height: number;
}

export function validateImageSource(input: ImageSourceInfo): string | undefined {
  if (input.bytes > MAX_BYTES) return "图片不能超过 20 MB";
  if (input.width * input.height > MAX_PIXELS) return "图片不能超过 4000 万像素";
  return undefined;
}

export function calculateTargetSize(width: number, height: number) {
  const scale = Math.min(1, MAX_LONG_EDGE / Math.max(width, height));
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

export function getResourceBudget(quota: number) {
  return Math.min(MAX_PROJECT_BYTES, Math.floor(quota * 0.7));
}
