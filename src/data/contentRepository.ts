import type { AssetVariantName, PracticeProject } from "../domain/practice";

export interface ContentRepository {
  load(): Promise<PracticeProject | undefined>;
  save(project: PracticeProject): Promise<void>;
}

export interface AssetRepository {
  get(assetId: string, variant: AssetVariantName): Promise<Blob | undefined>;
  put(assetId: string, variant: AssetVariantName, blob: Blob): Promise<void>;
  remove(assetId: string, variant: AssetVariantName): Promise<void>;
}
