import { createContext, useContext } from "react";
import type { AssetRepository } from "../data/contentRepository";
import type { PracticeAsset, PracticeProject } from "../domain/practice";
import type { DraftAutosaveStorage } from "../features/editor/useDraftAutosave";

export interface PracticeContextValue {
  scope?: "local" | "cloud" | "public";
  publishedProject: PracticeProject;
  draftProject?: PracticeProject;
  activeProject: PracticeProject;
  previewDraft: boolean;
  assets: AssetRepository;
  setPreviewDraft(value: boolean): void;
  saveDraft(project: PracticeProject): Promise<void>;
  replaceDraft(project: PracticeProject, assets: Map<string, Blob>): Promise<void>;
  restorePublished(): Promise<void>;
  clearDraft(): Promise<void>;
  storeAssetBlobs?(asset: PracticeAsset, blobs: Map<string, Blob>): Promise<void>;
  draftAutosaveStorage?: DraftAutosaveStorage;
}

export const PracticeContext = createContext<PracticeContextValue | undefined>(undefined);

export function usePractice(): PracticeContextValue {
  const value = useContext(PracticeContext);
  if (!value) throw new Error("usePractice must be used inside PracticeContext");
  return value;
}
