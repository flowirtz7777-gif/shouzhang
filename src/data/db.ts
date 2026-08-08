import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { PracticeProject } from "../domain/practice";

export const DATABASE_NAME = "social-practice-record";
export const DATABASE_VERSION = 1;
export const DRAFT_PROJECT_KEY = "draft";

export interface StoredEditBuffer {
  kind: string;
  entityId?: string;
  updatedAt: string;
  values: Record<string, unknown>;
}

export interface PracticeDbSchema extends DBSchema {
  projects: { key: string; value: PracticeProject };
  buffers: { key: string; value: StoredEditBuffer };
  assets: { key: string; value: Blob };
  meta: { key: string; value: string | number | boolean };
}

let databasePromise: Promise<IDBPDatabase<PracticeDbSchema>> | undefined;
let draftWriteGeneration = 0;

export function getDraftWriteGeneration(): number {
  return draftWriteGeneration;
}

export function invalidateDraftWrites(): number {
  draftWriteGeneration += 1;
  return draftWriteGeneration;
}

export function getPracticeDb(): Promise<IDBPDatabase<PracticeDbSchema>> {
  databasePromise ??= openDB<PracticeDbSchema>(DATABASE_NAME, DATABASE_VERSION, {
    upgrade(database) {
      if (!database.objectStoreNames.contains("projects")) database.createObjectStore("projects");
      if (!database.objectStoreNames.contains("buffers")) database.createObjectStore("buffers");
      if (!database.objectStoreNames.contains("assets")) database.createObjectStore("assets");
      if (!database.objectStoreNames.contains("meta")) database.createObjectStore("meta");
    },
  });
  return databasePromise;
}

export async function closePracticeDb(): Promise<void> {
  const database = await databasePromise;
  database?.close();
  databasePromise = undefined;
}

export function getAssetKey(assetId: string, variant: string): string {
  return `${assetId}:${variant}`;
}

export async function getLatestStoredEditBuffer(kind: string): Promise<StoredEditBuffer | undefined> {
  const database = await getPracticeDb();
  const buffers = await database.getAll("buffers");
  return buffers
    .filter((buffer) => buffer.kind === kind)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0];
}
