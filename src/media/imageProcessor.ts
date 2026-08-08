import { calculateTargetSize, validateImageSource } from "./imagePolicy";

export interface ImageVariantPlan {
  width: number;
  height: number;
  quality: number;
}

export interface ProcessedImageVariant extends ImageVariantPlan {
  blob: Blob;
  byteSize: number;
  mimeType: "image/webp";
}

export type ProcessImageResult =
  | {
      ok: true;
      original: { width: number; height: number; byteSize: number; mimeType: string };
      thumbnail: ProcessedImageVariant;
      display: ProcessedImageVariant;
    }
  | { ok: false; error: string };

export function makeVariantPlan(width: number, height: number): {
  thumbnail: ImageVariantPlan;
  display: ImageVariantPlan;
} {
  const display = calculateTargetSize(width, height);
  const thumbnailScale = Math.min(1, 480 / Math.max(width, height));
  return {
    thumbnail: {
      width: Math.round(width * thumbnailScale),
      height: Math.round(height * thumbnailScale),
      quality: 0.76,
    },
    display: { ...display, quality: 0.82 },
  };
}

export async function processImage(file: File): Promise<ProcessImageResult> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    return { ok: false, error: "无法读取图片，请换一张照片" };
  }

  const original = {
    width: bitmap.width,
    height: bitmap.height,
    byteSize: file.size,
    mimeType: file.type,
  };

  try {
    const validationError = validateImageSource({
      bytes: file.size,
      width: original.width,
      height: original.height,
    });
    if (validationError) return { ok: false, error: validationError };

    const plan = makeVariantPlan(original.width, original.height);
    const thumbnail = await renderVariant(bitmap, plan.thumbnail);
    const display = await renderVariant(bitmap, plan.display);
    if (!thumbnail || !display) return { ok: false, error: "图片压缩失败，请重新上传" };

    return { ok: true, original, thumbnail, display };
  } finally {
    bitmap.close();
  }
}

async function renderVariant(bitmap: ImageBitmap, plan: ImageVariantPlan): Promise<ProcessedImageVariant | undefined> {
  const canvas = document.createElement("canvas");
  canvas.width = plan.width;
  canvas.height = plan.height;
  const context = canvas.getContext("2d");
  if (!context) return undefined;
  context.drawImage(bitmap, 0, 0, plan.width, plan.height);
  const blob = await canvasToWebp(canvas, plan.quality);
  if (!blob) return undefined;
  return {
    ...plan,
    blob,
    byteSize: blob.size,
    mimeType: "image/webp",
  };
}

function canvasToWebp(canvas: HTMLCanvasElement, quality: number): Promise<Blob | undefined> {
  if ("convertToBlob" in canvas && typeof canvas.convertToBlob === "function") {
    return canvas.convertToBlob({ type: "image/webp", quality });
  }
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob ?? undefined), "image/webp", quality);
  });
}
