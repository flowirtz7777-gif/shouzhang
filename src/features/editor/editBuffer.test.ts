import { seedProject } from "../../domain/seedProject";
import {
  commitEntryBuffer,
  createEntryBuffer,
  updateEntryBuffer,
} from "./editBuffer";

test("keeps incomplete activity fields outside the valid project", () => {
  const projectBeforeCommit = structuredClone(seedProject);
  const buffer = createEntryBuffer({ title: "", date: "" });
  expect(buffer.status).toBe("incomplete");
  expect(commitEntryBuffer(seedProject, buffer)).toEqual({
    ok: false,
    errors: expect.any(Array),
  });
  expect(seedProject).toEqual(projectBeforeCommit);
});

test("produces an upsert action only for a valid activity", () => {
  const buffer = createEntryBuffer(seedProject.entries[0]!);
  const result = commitEntryBuffer(seedProject, buffer);
  expect(buffer.status).toBe("ready");
  expect(result).toEqual({
    ok: true,
    action: { type: "entry/upsert", entry: seedProject.entries[0] },
    entry: seedProject.entries[0],
  });
});

test("requires alternative text for every photo", () => {
  const source = structuredClone(seedProject.entries[0]!);
  source.photos[0]!.alt = " ";
  const result = commitEntryBuffer(seedProject, createEntryBuffer(source));
  expect(result).toEqual({
    ok: false,
    errors: expect.arrayContaining(["请填写照片替代文本"]),
  });
});

test("keeps invalid member and asset references out of the project", () => {
  const source = structuredClone(seedProject.entries[0]!);
  source.memberIds.push("99999999-9999-4999-8999-999999999999");
  source.photos[0]!.assetId = "88888888-8888-4888-8888-888888888888";
  const result = commitEntryBuffer(seedProject, createEntryBuffer(source));
  expect(result).toEqual({
    ok: false,
    errors: expect.arrayContaining([
      "活动关联了不存在的成员",
      "活动照片引用了不存在的图片资源",
    ]),
  });
});

test("recomputes readiness whenever raw fields change", () => {
  const ready = createEntryBuffer(seedProject.entries[0]!, "2026-07-14T08:00:00.000Z");
  const incomplete = updateEntryBuffer(
    ready,
    { summary: "" },
    "2026-07-14T08:00:01.000Z",
  );
  expect(incomplete.status).toBe("incomplete");
  expect(incomplete.updatedAt).toBe("2026-07-14T08:00:01.000Z");
  expect(ready.values.summary).not.toBe("");
});

test("rejects an activity that would make chapter order run backwards", () => {
  const firstResearchEntry = seedProject.entries.find(
    (entry) => entry.phaseId === seedProject.phases[1]!.id,
  )!;
  const source = {
    ...firstResearchEntry,
    date: "2026-06-30",
  };
  const result = commitEntryBuffer(seedProject, createEntryBuffer(source));
  expect(result).toEqual({
    ok: false,
    errors: expect.arrayContaining(["活动顺序与章节顺序不一致"]),
  });
});
