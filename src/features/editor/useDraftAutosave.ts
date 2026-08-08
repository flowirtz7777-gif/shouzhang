import { useEffect, useMemo, useRef, useState } from "react";
import type { PracticeProject } from "../../domain/practice";
import { draftProjectSchema } from "../../domain/practiceSchema";
import {
  DRAFT_PROJECT_KEY,
  getDraftWriteGeneration,
  getPracticeDb,
  type StoredEditBuffer,
} from "../../data/db";
import { commitDraftBuffer, type DraftEditBuffer } from "./editBuffer";
import { editorReducer, type EditorAction } from "./editorReducer";

export const DRAFT_AUTOSAVE_DELAY_MS = 350;

export type DraftAutosaveStatus = "idle" | "saving" | "saved" | "error";

export interface DraftCommitSuccess {
  ok: true;
  action: EditorAction;
}

export interface DraftCommitFailure {
  ok: false;
  errors: string[];
}

export type DraftCommitResult = DraftCommitSuccess | DraftCommitFailure;

export interface DraftAutosaveStorage {
  saveBuffer(buffer: DraftEditBuffer<object>): Promise<void>;
  saveProject(project: PracticeProject): Promise<void>;
}

export interface UseDraftAutosaveOptions {
  buffer?: DraftEditBuffer<object>;
  project?: PracticeProject;
  committedProject?: PracticeProject;
  commitBuffer?: (
    project: PracticeProject,
    buffer: DraftEditBuffer<object>,
  ) => DraftCommitResult;
  storage?: DraftAutosaveStorage;
  delayMs?: number;
  enabled?: boolean;
}

export interface DraftAutosaveState {
  status: DraftAutosaveStatus;
  saving: boolean;
  saved: boolean;
  error?: Error;
  message: string;
  liveRegionProps: {
    role: "status";
    "aria-live": "polite";
    "aria-atomic": true;
  };
}

function toStoredBuffer(buffer: DraftEditBuffer<object>): StoredEditBuffer {
  return {
    kind: buffer.kind,
    entityId: buffer.entityId,
    updatedAt: buffer.updatedAt,
    values: { ...buffer.values },
  };
}

export function getEditBufferKey(buffer: DraftEditBuffer<object>): string {
  return `${buffer.kind}:${buffer.entityId ?? "new"}`;
}

export const indexedDbDraftAutosaveStorage: DraftAutosaveStorage = {
  async saveBuffer(buffer) {
    const database = await getPracticeDb();
    await database.put("buffers", toStoredBuffer(buffer), getEditBufferKey(buffer));
  },
  async saveProject(project) {
    const database = await getPracticeDb();
    await database.put(
      "projects",
      draftProjectSchema.parse(project),
      DRAFT_PROJECT_KEY,
    );
  },
};

function errorMessage(error: Error): string {
  return `自动保存失败：${error.message || "未知错误"}`;
}

export function useDraftAutosave({
  buffer,
  project,
  committedProject,
  commitBuffer = commitDraftBuffer,
  storage = indexedDbDraftAutosaveStorage,
  delayMs = DRAFT_AUTOSAVE_DELAY_MS,
  enabled = true,
}: UseDraftAutosaveOptions): DraftAutosaveState {
  const [status, setStatus] = useState<DraftAutosaveStatus>("idle");
  const [error, setError] = useState<Error>();
  const revisionRef = useRef(0);
  const queueRef = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    if (!enabled || (!buffer && !committedProject && !project)) return;

    const revision = ++revisionRef.current;
    const writeGeneration = getDraftWriteGeneration();
    const timeout = window.setTimeout(() => {
      if (writeGeneration !== getDraftWriteGeneration()) return;
      if (revision === revisionRef.current) {
        setStatus("saving");
        setError(undefined);
      }

      const save = async () => {
        if (writeGeneration !== getDraftWriteGeneration()) return;
        if (buffer) await storage.saveBuffer(buffer);
        if (writeGeneration !== getDraftWriteGeneration()) return;

        let validProject = committedProject;
        if (!validProject && project && buffer) {
          const result = commitBuffer(project, buffer);
          if (result.ok) validProject = editorReducer(project, result.action);
        } else if (!validProject && project && !buffer) {
          validProject = project;
        }

        if (validProject && writeGeneration === getDraftWriteGeneration()) {
          await storage.saveProject(validProject);
        }
      };

      queueRef.current = queueRef.current
        .catch(() => undefined)
        .then(save)
        .then(() => {
          if (revision === revisionRef.current) setStatus("saved");
        })
        .catch((reason: unknown) => {
          if (revision !== revisionRef.current) return;
          const nextError = reason instanceof Error ? reason : new Error(String(reason));
          setError(nextError);
          setStatus("error");
        });
    }, delayMs);

    return () => {
      window.clearTimeout(timeout);
      if (revisionRef.current === revision) revisionRef.current += 1;
    };
  }, [buffer, commitBuffer, committedProject, delayMs, enabled, project, storage]);

  const message = status === "saving"
    ? "正在自动保存"
    : status === "saved"
      ? "已自动保存"
      : status === "error" && error
        ? errorMessage(error)
        : "";

  const liveRegionProps = useMemo(
    () => ({
      role: "status" as const,
      "aria-live": "polite" as const,
      "aria-atomic": true as const,
    }),
    [],
  );

  return {
    status,
    saving: status === "saving",
    saved: status === "saved",
    error,
    message,
    liveRegionProps,
  };
}
