import { calculateTargetSize, getResourceBudget, validateImageSource } from "./imagePolicy";

test("rejects files above 20 MB", () => {
  expect(validateImageSource({ bytes: 20 * 1024 * 1024 + 1, width: 1000, height: 1000 })).toBe(
    "图片不能超过 20 MB",
  );
});

test("rejects images above 40 megapixels", () => {
  expect(validateImageSource({ bytes: 1, width: 8000, height: 6000 })).toBe("图片不能超过 4000 万像素");
});

test("limits the long edge to 1600 pixels", () => {
  expect(calculateTargetSize(4000, 2000)).toEqual({ width: 1600, height: 800 });
});

test("uses the smaller of 300 MB and 70 percent of quota", () => {
  expect(getResourceBudget(200 * 1024 * 1024)).toBe(140 * 1024 * 1024);
  expect(getResourceBudget(1024 * 1024 * 1024)).toBe(300 * 1024 * 1024);
});
