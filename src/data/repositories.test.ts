import { deleteDB } from "idb";
import { afterEach, beforeEach, expect, test } from "vitest";
import { seedProject } from "../domain/seedProject";
import { resolveAssetUrl, revokeAllResolvedAssetUrls } from "./assetResolver";
import { closePracticeDb, DATABASE_NAME } from "./db";
import { DraftRepository } from "./draftRepository";

beforeEach(async () => {
  await closePracticeDb();
  await deleteDB(DATABASE_NAME);
});

afterEach(async () => {
  revokeAllResolvedAssetUrls();
  await closePracticeDb();
});

test("clones published content when no draft exists", async () => {
  const repository = new DraftRepository();
  const project = await repository.loadOrClone(seedProject);
  expect(project.title).toBe(seedProject.title);
  expect(await repository.load()).toEqual(project);
});

test("saves and reads draft asset blobs by variant", async () => {
  const repository = new DraftRepository();
  const blob = new Blob(["local"], { type: "image/webp" });
  await repository.put(seedProject.assets[0]!.id, "display", blob);
  await expect(repository.get(seedProject.assets[0]!.id, "display")).resolves.toEqual(blob);
  await repository.remove(seedProject.assets[0]!.id, "display");
  await expect(repository.get(seedProject.assets[0]!.id, "display")).resolves.toBeUndefined();
});

test("prefers an IndexedDB Blob over the published path", async () => {
  const blob = new Blob(["local"], { type: "image/webp" });
  const url = await resolveAssetUrl({
    assetId: seedProject.assets[0]!.id,
    variant: "display",
    localBlob: async () => blob,
    publishedPath: "/content/assets/example.webp",
  });
  expect(url.startsWith("blob:")).toBe(true);
});

test("falls back to the published path when the Blob is absent", async () => {
  await expect(
    resolveAssetUrl({
      assetId: seedProject.assets[0]!.id,
      variant: "display",
      localBlob: async () => undefined,
      publishedPath: "/content/assets/example.webp",
    }),
  ).resolves.toBe("/content/assets/example.webp");
});

test("replaces a draft and its complete asset set in one operation", async () => {
  const repository = new DraftRepository();
  await repository.loadOrClone(seedProject);
  const asset = seedProject.assets[0]!;
  const blobs = new Map([
    [`${asset.id}:thumbnail`, new Blob(["new-thumb"], { type: "image/webp" })],
    [`${asset.id}:display`, new Blob(["new-display"], { type: "image/webp" })],
  ]);
  const replacement = structuredClone(seedProject);
  replacement.subtitle = "替换后的本地草稿";

  await repository.replace(replacement, blobs);

  await expect(repository.load()).resolves.toMatchObject({ subtitle: "替换后的本地草稿" });
  await expect(repository.get(asset.id, "display")).resolves.toBe(blobs.get(`${asset.id}:display`));
});

test("uses a neutral missing image when no source exists", async () => {
  await expect(
    resolveAssetUrl({
      assetId: seedProject.assets[0]!.id,
      variant: "display",
      localBlob: async () => undefined,
    }),
  ).resolves.toBe("/ui-assets/missing-image.webp");
});
