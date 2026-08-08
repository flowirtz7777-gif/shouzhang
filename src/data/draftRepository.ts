import type { AssetVariantName, PracticeProject } from "../domain/practice";
import { draftProjectSchema } from "../domain/practiceSchema";
import type { AssetRepository, ContentRepository } from "./contentRepository";
import {
  DRAFT_PROJECT_KEY,
  getAssetKey,
  getPracticeDb,
  invalidateDraftWrites,
} from "./db";

const assetBlobCache = new Map<string, Blob>();

export class DraftRepository implements ContentRepository, AssetRepository {
  async load(): Promise<PracticeProject | undefined> {
    const database = await getPracticeDb();
    const project = await database.get("projects", DRAFT_PROJECT_KEY);
    return project ? draftProjectSchema.parse(project) : undefined;
  }

  async loadOrClone(published: PracticeProject): Promise<PracticeProject> {
    const existing = await this.load();
    if (existing) return existing;
    const clone = structuredClone(published);
    await this.save(clone);
    return clone;
  }

  async save(project: PracticeProject): Promise<void> {
    const database = await getPracticeDb();
    await database.put("projects", draftProjectSchema.parse(project), DRAFT_PROJECT_KEY);
  }

  async get(assetId: string, variant: AssetVariantName): Promise<Blob | undefined> {
    const database = await getPracticeDb();
    const key = getAssetKey(assetId, variant);
    const stored = await database.get("assets", key);
    return stored instanceof Blob ? stored : assetBlobCache.get(key);
  }

  async put(assetId: string, variant: AssetVariantName, blob: Blob): Promise<void> {
    const database = await getPracticeDb();
    const key = getAssetKey(assetId, variant);
    await database.put("assets", blob, key);
    assetBlobCache.set(key, blob);
  }

  async remove(assetId: string, variant: AssetVariantName): Promise<void> {
    const database = await getPracticeDb();
    const key = getAssetKey(assetId, variant);
    await database.delete("assets", key);
    assetBlobCache.delete(key);
  }

  async replace(project: PracticeProject, assets: Map<string, Blob>): Promise<void> {
    invalidateDraftWrites();
    const parsed = draftProjectSchema.parse(project);
    const database = await getPracticeDb();
    const transaction = database.transaction(["projects", "buffers", "assets"], "readwrite");
    const projectStore = transaction.objectStore("projects");
    const bufferStore = transaction.objectStore("buffers");
    const assetStore = transaction.objectStore("assets");
    const replacesAllAssets = assets.size > 0;

    if (replacesAllAssets) await assetStore.clear();
    await bufferStore.clear();
    for (const [key, blob] of assets) await assetStore.put(blob, key);
    await projectStore.put(parsed, DRAFT_PROJECT_KEY);
    await transaction.done;

    if (replacesAllAssets) assetBlobCache.clear();
    for (const [key, blob] of assets) assetBlobCache.set(key, blob);
  }

  async clear(): Promise<void> {
    invalidateDraftWrites();
    const database = await getPracticeDb();
    const transaction = database.transaction(["projects", "buffers", "assets", "meta"], "readwrite");
    await Promise.all([
      transaction.objectStore("projects").clear(),
      transaction.objectStore("buffers").clear(),
      transaction.objectStore("assets").clear(),
      transaction.objectStore("meta").clear(),
      transaction.done,
    ]);
    assetBlobCache.clear();
  }

  async copyPublishedAssets(project: PracticeProject): Promise<void> {
    const copyJobs = project.assets.flatMap((asset) =>
      (Object.entries(asset.variants) as Array<[AssetVariantName, { path?: string } | undefined]>)
        .filter((entry): entry is [AssetVariantName, { path: string }] => Boolean(entry[1]?.path))
        .map(async ([variant, value]) => {
          try {
            const response = await fetch(`/content/${value.path}`);
            if (!response.ok) return;
            await this.put(asset.id, variant, await response.blob());
          } catch {
            // Published assets are a convenience cache; missing files still fall back to their paths.
          }
        }),
    );
    await Promise.all(copyJobs);
  }
}
