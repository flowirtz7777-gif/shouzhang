import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { exportProjectJson, exportProjectZip } from "../../data/importExport";
import { seedProject } from "../../domain/seedProject";
import { DataTools, type DataToolsProps } from "./DataTools";

function renderDataTools(overrides: Partial<DataToolsProps> = {}) {
  const props: DataToolsProps = {
    project: seedProject,
    publishedProject: seedProject,
    getAssetBlob: async () => new Blob(["asset"], { type: "image/webp" }),
    onReplaceProject: vi.fn(),
    onRestorePublished: vi.fn(),
    onClearDraft: vi.fn(),
    saveFile: vi.fn(),
    ...overrides,
  };
  render(<DataTools {...props} />);
  return props;
}

test("previews an import before replacement", async () => {
  const onReplaceProject = vi.fn();
  renderDataTools({ onReplaceProject });

  const file = new File(
    [exportProjectJson(seedProject)],
    "practice.json",
    { type: "application/json" },
  );
  await userEvent.upload(screen.getByLabelText("导入数据"), file);

  const dialog = await screen.findByRole("dialog", { name: "导入预览" });
  expect(dialog).toHaveTextContent(`${seedProject.entries.length} 个活动`);
  expect(dialog).toHaveTextContent("部分图片或录音仅保留资源索引");
  expect(onReplaceProject).not.toHaveBeenCalled();
});

test("replaces the draft only after confirming the import preview", async () => {
  const onReplaceProject = vi.fn();
  renderDataTools({ onReplaceProject });

  await userEvent.upload(
    screen.getByLabelText("导入数据"),
    new File([exportProjectJson(seedProject)], "practice.json", { type: "application/json" }),
  );
  await userEvent.click(await screen.findByRole("button", { name: "替换当前草稿" }));

  await waitFor(() => expect(onReplaceProject).toHaveBeenCalledOnce());
  expect(onReplaceProject).toHaveBeenCalledWith(
    expect.objectContaining({ title: seedProject.title }),
    expect.any(Map),
  );
  expect(await screen.findByText(/已导入.*并替换当前草稿/)).toBeVisible();
});

test("previews and restores the bundled assets from a ZIP import", async () => {
  const onReplaceProject = vi.fn();
  const blobs = new Map([
    [`${seedProject.assets[0]!.id}:thumbnail`, new Blob(["thumb"], { type: "image/webp" })],
    [`${seedProject.assets[0]!.id}:display`, new Blob(["display"], { type: "image/webp" })],
  ]);
  const zip = await exportProjectZip(
    seedProject,
    async (assetId, variant) => blobs.get(`${assetId}:${variant}`),
  );
  renderDataTools({ onReplaceProject });

  await userEvent.upload(
    screen.getByLabelText("导入数据"),
    new File([zip], "practice.zip", { type: "application/zip" }),
  );

  const dialog = await screen.findByRole("dialog", { name: "导入预览" });
  expect(dialog).toHaveTextContent("包内已校验 2 个资源文件");
  await userEvent.click(screen.getByRole("button", { name: "替换当前草稿" }));
  await waitFor(() => expect(onReplaceProject).toHaveBeenCalledOnce());
  expect(onReplaceProject.mock.calls[0]?.[1]).toBeInstanceOf(Map);
  expect((onReplaceProject.mock.calls[0]?.[1] as Map<string, Blob>).size).toBe(2);
});

test("blocks ZIP publishing when a required asset is missing", async () => {
  const saveFile = vi.fn();
  renderDataTools({ getAssetBlob: async () => undefined, saveFile });

  await userEvent.click(screen.getByRole("button", { name: "导出发布包" }));

  expect(await screen.findByText(/缺少资源 .*:display/)).toBeVisible();
  expect(saveFile).not.toHaveBeenCalled();
});

test("exports JSON through the injected file saver", async () => {
  const saveFile = vi.fn();
  renderDataTools({ saveFile });

  await userEvent.click(screen.getByRole("button", { name: "导出结构数据" }));

  await waitFor(() => expect(saveFile).toHaveBeenCalledOnce());
  expect(saveFile.mock.calls[0]?.[0]).toBeInstanceOf(Blob);
  expect(saveFile.mock.calls[0]?.[1]).toMatch(/结构数据\.json$/);
});

test("requires confirmation before restoring published data", async () => {
  const onRestorePublished = vi.fn();
  renderDataTools({ onRestorePublished });

  await userEvent.click(screen.getByRole("button", { name: "恢复已发布版本" }));

  expect(screen.getByRole("dialog", { name: "恢复已发布版本" })).toBeVisible();
  expect(screen.getByRole("button", { name: "取消" })).toHaveFocus();
  expect(onRestorePublished).not.toHaveBeenCalled();
});

test("runs restore and clear callbacks only after their confirmations", async () => {
  const onRestorePublished = vi.fn();
  const onClearDraft = vi.fn();
  renderDataTools({ onRestorePublished, onClearDraft });

  await userEvent.click(screen.getByRole("button", { name: "恢复已发布版本" }));
  await userEvent.click(screen.getByRole("button", { name: "确认恢复" }));
  await waitFor(() => expect(onRestorePublished).toHaveBeenCalledOnce());

  await userEvent.click(screen.getByRole("button", { name: "清空本地草稿" }));
  expect(onClearDraft).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole("button", { name: "确认清空" }));
  await waitFor(() => expect(onClearDraft).toHaveBeenCalledOnce());
});
