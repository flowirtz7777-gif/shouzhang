import { makeVariantPlan, processImage } from "./imageProcessor";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

test("creates thumbnail and display plans", () => {
  expect(makeVariantPlan(2400, 1600)).toEqual({
    thumbnail: { width: 480, height: 320, quality: 0.76 },
    display: { width: 1600, height: 1067, quality: 0.82 },
  });
});

test("does not upscale small images", () => {
  expect(makeVariantPlan(320, 240)).toEqual({
    thumbnail: { width: 320, height: 240, quality: 0.76 },
    display: { width: 320, height: 240, quality: 0.82 },
  });
});

test("keeps original dimensions after closing the image bitmap", async () => {
  let closed = false;
  const close = vi.fn(() => {
    closed = true;
  });
  vi.stubGlobal("createImageBitmap", vi.fn(async () => ({
    get width() {
      return closed ? 0 : 17;
    },
    get height() {
      return closed ? 0 : 9;
    },
    close,
  })));
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    drawImage: vi.fn(),
  } as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((callback) => {
    callback(new Blob(["webp"], { type: "image/webp" }));
  });

  const result = await processImage(new File(["source"], "source.png", { type: "image/png" }));

  expect(result).toMatchObject({ ok: true, original: { width: 17, height: 9 } });
  expect(close).toHaveBeenCalledOnce();
});
