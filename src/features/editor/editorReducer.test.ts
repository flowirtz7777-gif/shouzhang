import { seedProject } from "../../domain/seedProject";
import type { PracticeEntry } from "../../domain/practice";
import {
  collectReferencedAssetIds,
  editorReducer,
  isAssetUnreferenced,
} from "./editorReducer";

test("blocks deleting a phase that still owns activities", () => {
  const result = editorReducer(seedProject, {
    type: "phase/delete",
    phaseId: seedProject.phases[0]!.id,
  });
  expect(result).toBe(seedProject);
});

test("removes a deleted member from every activity", () => {
  const memberId = seedProject.members[0]!.id;
  const result = editorReducer(seedProject, { type: "member/delete", memberId });
  expect(result.members.some((member) => member.id === memberId)).toBe(false);
  expect(result.entries.every((entry) => !entry.memberIds.includes(memberId))).toBe(true);
});

test("normalizes same-day order after deleting an activity", () => {
  const entryId = seedProject.entries[1]!.id;
  const date = seedProject.entries[1]!.date;
  const result = editorReducer(seedProject, { type: "entry/delete", entryId });
  const sameDay = result.entries.filter((entry) => entry.date === date);
  expect(sameDay.map((entry) => entry.dayOrder)).toEqual([0]);
});

test("normalizes colliding same-day order after upserting an activity", () => {
  const source = seedProject.entries[1]!;
  const entry: PracticeEntry = {
    ...source,
    id: "22222222-2222-4222-8222-222222222228",
    title: "同日新增活动",
    photos: [],
    memberIds: [],
    dayOrder: 0,
  };
  const result = editorReducer(seedProject, { type: "entry/upsert", entry });
  const sameDay = result.entries.filter((candidate) => candidate.date === entry.date);
  expect(sameDay.map((candidate) => candidate.dayOrder)).toEqual([0, 1, 2]);
});

test("does not delete a shared asset when an activity is removed", () => {
  const assetId = seedProject.assets[0]!.id;
  const result = editorReducer(seedProject, {
    type: "entry/delete",
    entryId: seedProject.entries[0]!.id,
  });
  expect(result.assets.some((asset) => asset.id === assetId)).toBe(true);
  expect(collectReferencedAssetIds(result)).toContain(assetId);
});

test("rejects an activity with dangling references", () => {
  const entry: PracticeEntry = {
    ...seedProject.entries[0]!,
    phaseId: "99999999-9999-4999-8999-999999999999",
  };
  expect(editorReducer(seedProject, { type: "entry/upsert", entry })).toBe(seedProject);
});

test("rejects replacing the project with invalid structured data", () => {
  const project = structuredClone(seedProject);
  project.entries[0]!.memberIds.push("99999999-9999-4999-8999-999999999999");
  expect(editorReducer(seedProject, { type: "project/replace", project })).toBe(seedProject);
});

test("only reports assets as unreferenced after every reference is removed", () => {
  const assetId = seedProject.assets[0]!.id;
  expect(isAssetUnreferenced(seedProject, assetId)).toBe(false);

  const project = {
    ...seedProject,
    entries: seedProject.entries.map((entry) => ({ ...entry, photos: [] })),
  };
  expect(isAssetUnreferenced(project, assetId)).toBe(true);
});
