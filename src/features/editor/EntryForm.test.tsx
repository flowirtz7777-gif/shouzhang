import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { seedProject } from "../../domain/seedProject";
import { createEntryBuffer } from "./editBuffer";
import { EntryForm } from "./EntryForm";

test("requires alternative text for every uploaded photo", async () => {
  const onCommit = vi.fn();
  render(
    <EntryForm
      project={seedProject}
      buffer={createEntryBuffer(seedProject.entries[0]!)}
      onBufferChange={() => undefined}
      onCommit={onCommit}
      processImage={async () => ({
        asset: seedProject.assets[0]!,
        blobs: new Map(),
      })}
    />,
  );
  await userEvent.upload(
    screen.getByLabelText("上传照片"),
    new File(["image"], "field.jpg", { type: "image/jpeg" }),
  );
  await userEvent.click(screen.getByRole("button", { name: "保存活动" }));
  expect(screen.getByText("请填写照片替代文本")).toBeVisible();
  expect(onCommit).not.toHaveBeenCalled();
});

test("commits a complete activity buffer", async () => {
  const onCommit = vi.fn();
  render(
    <EntryForm
      project={seedProject}
      buffer={createEntryBuffer(seedProject.entries[0]!)}
      onBufferChange={() => undefined}
      onCommit={onCommit}
      processImage={vi.fn()}
    />,
  );
  await userEvent.click(screen.getByRole("button", { name: "保存活动" }));
  expect(onCommit).toHaveBeenCalledWith(
    expect.objectContaining({ type: "entry/upsert" }),
    [],
  );
});
