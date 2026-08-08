import { act, render, renderHook, screen } from "@testing-library/react";
import { deleteDB } from "idb";
import { afterEach, expect, test, vi } from "vitest";
import {
  closePracticeDb,
  DATABASE_NAME,
  getPracticeDb,
  invalidateDraftWrites,
} from "../../data/db";
import { seedProject } from "../../domain/seedProject";
import { createEntryBuffer, updateEntryBuffer } from "./editBuffer";
import {
  DRAFT_AUTOSAVE_DELAY_MS,
  type DraftAutosaveStorage,
  type UseDraftAutosaveOptions,
  indexedDbDraftAutosaveStorage,
  useDraftAutosave,
} from "./useDraftAutosave";

afterEach(async () => {
  vi.useRealTimers();
  await closePracticeDb();
});

test("waits 350 ms and writes the buffer before the valid project", async () => {
  vi.useFakeTimers();
  const calls: string[] = [];
  const storage: DraftAutosaveStorage = {
    saveBuffer: async () => { calls.push("buffer"); },
    saveProject: async () => { calls.push("project"); },
  };
  const buffer = createEntryBuffer(seedProject.entries[0]!);
  renderHook(() => useDraftAutosave({ buffer, project: seedProject, storage }));

  await act(async () => { await vi.advanceTimersByTimeAsync(349); });
  expect(calls).toEqual([]);
  await act(async () => { await vi.advanceTimersByTimeAsync(1); });
  expect(calls).toEqual(["buffer", "project"]);
});

test("resets the debounce window after the last buffer change", async () => {
  vi.useFakeTimers();
  const saveBuffer = vi.fn(async () => undefined);
  const storage: DraftAutosaveStorage = {
    saveBuffer,
    saveProject: async () => undefined,
  };
  const initial = createEntryBuffer(seedProject.entries[0]!);
  const { rerender } = renderHook(
    ({ buffer }) => useDraftAutosave({ buffer, storage }),
    { initialProps: { buffer: initial } },
  );

  await act(async () => { await vi.advanceTimersByTimeAsync(250); });
  rerender({ buffer: updateEntryBuffer(initial, { title: "更新后的标题" }) });
  await act(async () => { await vi.advanceTimersByTimeAsync(349); });
  expect(saveBuffer).not.toHaveBeenCalled();
  await act(async () => { await vi.advanceTimersByTimeAsync(1); });
  expect(saveBuffer).toHaveBeenCalledTimes(1);
});

test("saves an incomplete buffer without writing it into the valid project", async () => {
  vi.useFakeTimers();
  const saveBuffer = vi.fn(async () => undefined);
  const saveProject = vi.fn(async () => undefined);
  const storage = { saveBuffer, saveProject };
  const buffer = createEntryBuffer({ title: "未完成" });
  renderHook(() => useDraftAutosave({ buffer, project: seedProject, storage }));

  await act(async () => {
    await vi.advanceTimersByTimeAsync(DRAFT_AUTOSAVE_DELAY_MS);
  });
  expect(saveBuffer).toHaveBeenCalledWith(buffer);
  expect(saveProject).not.toHaveBeenCalled();
});

test("serializes an explicitly committed project after its buffer", async () => {
  vi.useFakeTimers();
  const calls: string[] = [];
  const storage: DraftAutosaveStorage = {
    saveBuffer: async () => { calls.push("buffer"); },
    saveProject: async () => { calls.push("committed-project"); },
  };
  const buffer = createEntryBuffer({ title: "仍未完成" });
  renderHook(() => useDraftAutosave({
    buffer,
    committedProject: seedProject,
    storage,
  }));

  await act(async () => {
    await vi.advanceTimersByTimeAsync(DRAFT_AUTOSAVE_DELAY_MS);
  });
  expect(calls).toEqual(["buffer", "committed-project"]);
});

test("stops an older autosave after a draft replacement invalidates its writes", async () => {
  vi.useFakeTimers();
  let finishBufferSave: (() => void) | undefined;
  const saveBuffer = vi.fn(() => new Promise<void>((resolve) => {
    finishBufferSave = resolve;
  }));
  const saveProject = vi.fn(async () => undefined);
  const buffer = createEntryBuffer(seedProject.entries[0]!);
  renderHook(() => useDraftAutosave({
    buffer,
    project: seedProject,
    storage: { saveBuffer, saveProject },
  }));

  await act(async () => {
    vi.advanceTimersByTime(DRAFT_AUTOSAVE_DELAY_MS);
    await Promise.resolve();
  });
  expect(saveBuffer).toHaveBeenCalledTimes(1);

  invalidateDraftWrites();
  await act(async () => {
    finishBufferSave?.();
    await Promise.resolve();
  });

  expect(saveProject).not.toHaveBeenCalled();
});

function StatusHarness({ options }: { options: UseDraftAutosaveOptions }) {
  const state = useDraftAutosave(options);
  return <p {...state.liveRegionProps}>{state.message}</p>;
}

test("announces storage failures through an ARIA live region", async () => {
  vi.useFakeTimers();
  const storage: DraftAutosaveStorage = {
    saveBuffer: async () => { throw new Error("存储空间不足"); },
    saveProject: async () => undefined,
  };
  render(<StatusHarness options={{
    buffer: createEntryBuffer({ title: "未完成" }),
    storage,
  }} />);

  await act(async () => {
    await vi.advanceTimersByTimeAsync(DRAFT_AUTOSAVE_DELAY_MS);
  });
  expect(screen.getByRole("status")).toHaveTextContent("自动保存失败：存储空间不足");
});

test("uses IndexedDB for the default buffer and project storage", async () => {
  await closePracticeDb();
  await deleteDB(DATABASE_NAME);
  const buffer = createEntryBuffer(seedProject.entries[0]!);

  await indexedDbDraftAutosaveStorage.saveBuffer(buffer);
  await indexedDbDraftAutosaveStorage.saveProject(seedProject);

  const database = await getPracticeDb();
  await expect(database.get("buffers", `entry:${buffer.entityId}`)).resolves.toEqual({
    kind: "entry",
    entityId: buffer.entityId,
    updatedAt: buffer.updatedAt,
    values: buffer.values,
  });
  await expect(database.get("projects", "draft")).resolves.toEqual(seedProject);
  await closePracticeDb();
});
