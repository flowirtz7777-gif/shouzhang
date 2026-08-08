import {
  Archive,
  Download,
  FileJson,
  RotateCcw,
  Trash2,
  Upload,
} from "lucide-react";
import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { ToastRegion } from "../../components/ToastRegion";
import {
  exportProjectJson,
  exportProjectZip,
  importProjectJson,
  importProjectZip,
  type AssetBlobReader,
  type ImportResult,
} from "../../data/importExport";
import {
  createImportPreview,
  describeImportError,
  type ImportPreview,
  type ImportSourceKind,
} from "../../data/importPreview";
import type { AssetVariantName, PracticeProject } from "../../domain/practice";
import "./DataTools.css";

export type SaveFile = (blob: Blob, fileName: string) => void | Promise<void>;

export interface DataToolsProps {
  project: PracticeProject;
  publishedProject: PracticeProject;
  getAssetBlob: AssetBlobReader;
  onReplaceProject(project: PracticeProject, assets: Map<string, Blob>): void | Promise<void>;
  onRestorePublished(): void | Promise<void>;
  onClearDraft(): void | Promise<void>;
  saveFile?: SaveFile;
  scope?: "local" | "cloud";
  allowClear?: boolean;
}

type DestructiveAction = "restore" | "clear";
type BusyAction = "json" | "zip" | "import" | "replace" | DestructiveAction;

interface PendingImport {
  result: ImportResult;
  preview: ImportPreview;
}

const requiredVariants: Record<"image" | "audio", AssetVariantName[]> = {
  image: ["display", "thumbnail"],
  audio: ["audio"],
};

function saveBlobDownload(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.hidden = true;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function fileStem(title: string): string {
  const sanitized = title.trim().replace(/[\\/:*?"<>|]+/g, "-");
  return sanitized || "社会实践手账";
}

function assetKey(assetId: string, variant: AssetVariantName): string {
  return `${assetId}:${variant}`;
}

function parseAssetKey(key: string): [string, AssetVariantName] {
  const separator = key.lastIndexOf(":");
  if (separator < 1) throw new Error(`资源索引格式无效：${key}`);
  return [key.slice(0, separator), key.slice(separator + 1) as AssetVariantName];
}

async function collectRequiredAssets(
  project: PracticeProject,
  getAssetBlob: AssetBlobReader,
): Promise<Map<string, Blob>> {
  const blobs = new Map<string, Blob>();

  for (const asset of project.assets) {
    for (const variant of requiredVariants[asset.kind]) {
      if (!asset.variants[variant]) {
        throw new Error(`缺少资源描述 ${asset.id}:${variant}`);
      }
      const blob = await getAssetBlob(asset.id, variant);
      if (!blob) throw new Error(`缺少资源 ${asset.id}:${variant}`);
      blobs.set(assetKey(asset.id, variant), blob);
    }
  }

  return blobs;
}

function detectImportKind(file: File): ImportSourceKind {
  const extension = file.name.split(".").at(-1)?.toLowerCase();
  if (extension === "json" || file.type === "application/json") return "json";
  if (
    extension === "zip"
    || file.type === "application/zip"
    || file.type === "application/x-zip-compressed"
  ) {
    return "zip";
  }
  throw new Error("仅支持 JSON 结构数据或 ZIP 发布包");
}

function describePreview(preview: ImportPreview, scope: "local" | "cloud"): string {
  const { summary } = preview;
  const source = preview.sourceKind === "zip" ? "ZIP 发布包" : "JSON 结构数据";
  const assetNote = preview.sourceKind === "zip"
    ? `包内已校验 ${preview.assetFiles} 个资源文件。`
    : "JSON 不包含图片或录音文件。";
  const warningNote = preview.warnings.length > 0
    ? ` 注意：${preview.warnings.join("；")}。`
    : "";

  return `将从${source}导入《${preview.projectTitle}》：${summary.phases} 个章节、${summary.entries} 个活动、${summary.members} 位成员、${summary.images} 张图片、${summary.audio} 段录音。${assetNote}${warningNote} 确认后将替换当前${scope === "cloud" ? "云端" : "本地"}草稿。`;
}

export function DataTools({
  project,
  publishedProject,
  getAssetBlob,
  onReplaceProject,
  onRestorePublished,
  onClearDraft,
  saveFile = saveBlobDownload,
  scope = "local",
  allowClear = true,
}: DataToolsProps) {
  const [busyAction, setBusyAction] = useState<BusyAction>();
  const [pendingImport, setPendingImport] = useState<PendingImport>();
  const [destructiveAction, setDestructiveAction] = useState<DestructiveAction>();
  const [errors, setErrors] = useState<string[]>([]);
  const [messages, setMessages] = useState<string[]>([]);
  const toastTimerRef = useRef<number | undefined>(undefined);
  const busy = Boolean(busyAction);

  useEffect(
    () => () => {
      if (toastTimerRef.current !== undefined) window.clearTimeout(toastTimerRef.current);
    },
    [],
  );

  function announce(message: string) {
    if (toastTimerRef.current !== undefined) window.clearTimeout(toastTimerRef.current);
    setMessages([message]);
    toastTimerRef.current = window.setTimeout(() => setMessages([]), 2800);
  }

  function reportError(error: unknown) {
    setErrors(describeImportError(error));
  }

  async function exportJson() {
    setBusyAction("json");
    setErrors([]);
    try {
      const json = exportProjectJson(project);
      await saveFile(
        new Blob([json], { type: "application/json;charset=utf-8" }),
        `${fileStem(project.title)}-结构数据.json`,
      );
      announce("JSON 结构数据已导出");
    } catch (error) {
      reportError(error);
    } finally {
      setBusyAction(undefined);
    }
  }

  async function exportZip() {
    setBusyAction("zip");
    setErrors([]);
    try {
      const blobs = await collectRequiredAssets(project, getAssetBlob);
      const zip = await exportProjectZip(
        project,
        async (assetId, variant) => blobs.get(assetKey(assetId, variant)),
      );
      await saveFile(zip, `${fileStem(project.title)}-发布包.zip`);
      announce("ZIP 发布包已导出");
    } catch (error) {
      reportError(error);
    } finally {
      setBusyAction(undefined);
    }
  }

  async function importFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setBusyAction("import");
    setErrors([]);
    setPendingImport(undefined);
    try {
      const sourceKind = detectImportKind(file);
      const result = sourceKind === "zip"
        ? await importProjectZip(file)
        : await importProjectJson(await file.text(), async (key) => {
          const [assetId, variant] = parseAssetKey(key);
          return Boolean(await getAssetBlob(assetId, variant));
        });
      setPendingImport({ result, preview: createImportPreview(result, sourceKind) });
    } catch (error) {
      reportError(error);
    } finally {
      setBusyAction(undefined);
    }
  }

  async function replaceProject() {
    if (!pendingImport) return;
    setBusyAction("replace");
    setErrors([]);
    try {
      await onReplaceProject(pendingImport.result.project, pendingImport.result.assets);
      announce(`已导入《${pendingImport.preview.projectTitle}》并替换当前草稿`);
      setPendingImport(undefined);
    } catch (error) {
      reportError(error);
      setPendingImport(undefined);
    } finally {
      setBusyAction(undefined);
    }
  }

  async function runDestructiveAction(action: DestructiveAction) {
    setBusyAction(action);
    setErrors([]);
    try {
      if (action === "restore") {
        await onRestorePublished();
        announce("已恢复到当前发布版本");
      } else {
        await onClearDraft();
        announce("本地草稿已清空");
      }
      setDestructiveAction(undefined);
    } catch (error) {
      reportError(error);
      setDestructiveAction(undefined);
    } finally {
      setBusyAction(undefined);
    }
  }

  return (
    <section className="data-tools" aria-labelledby="data-tools-title">
      <div className="data-tools__heading">
        <span>DATA DESK</span>
        <h3 id="data-tools-title">数据工具</h3>
        <p>结构数据适合日常备份，完整迁移或发布请使用 ZIP 发布包。</p>
      </div>

      <div className="data-tools__group" aria-labelledby="data-export-title">
        <div className="data-tools__group-title">
          <Download aria-hidden="true" size={18} />
          <h4 id="data-export-title">带走一份记录</h4>
        </div>
        <div className="data-tools__actions">
          <button
            type="button"
            className="data-tools__command"
            aria-label="导出结构数据"
            disabled={busy}
            onClick={() => void exportJson()}
          >
            <FileJson aria-hidden="true" size={20} />
            <span><strong>导出结构数据</strong><small>JSON，不包含媒体文件</small></span>
          </button>
          <button
            type="button"
            className="data-tools__command data-tools__command--accent"
            aria-label="导出发布包"
            disabled={busy}
            onClick={() => void exportZip()}
          >
            <Archive aria-hidden="true" size={20} />
            <span><strong>导出发布包</strong><small>ZIP，包含图片与录音</small></span>
          </button>
        </div>
      </div>

      <div className="data-tools__group" aria-labelledby="data-import-title">
        <div className="data-tools__group-title">
          <Upload aria-hidden="true" size={18} />
          <h4 id="data-import-title">接入已有记录</h4>
        </div>
        <label className={`data-tools__import ${busy ? "is-disabled" : ""}`}>
          <Upload aria-hidden="true" size={20} />
          <span><strong>{busyAction === "import" ? "正在校验..." : "导入数据"}</strong><small>选择 JSON 或 ZIP，确认前会先显示预览</small></span>
          <input
            type="file"
            aria-label="导入数据"
            accept=".json,.zip,application/json,application/zip,application/x-zip-compressed"
            disabled={busy}
            onChange={(event) => void importFile(event)}
          />
        </label>
      </div>

      <div className="data-tools__group data-tools__group--danger" aria-labelledby="data-reset-title">
        <div className="data-tools__group-title">
          <RotateCcw aria-hidden="true" size={18} />
          <h4 id="data-reset-title">{scope === "cloud" ? "恢复发布版本" : "重置本地工作区"}</h4>
        </div>
        <p className="data-tools__published-note">当前发布快照：《{publishedProject.title}》</p>
        <div className="data-tools__actions">
          <button
            type="button"
            className="data-tools__command"
            aria-label="恢复已发布版本"
            disabled={busy}
            onClick={() => setDestructiveAction("restore")}
          >
            <RotateCcw aria-hidden="true" size={20} />
            <span><strong>恢复已发布版本</strong><small>放弃{scope === "cloud" ? "云端草稿修改" : "本地修改"}并重新载入快照</small></span>
          </button>
          {allowClear ? <button
            type="button"
            className="data-tools__command data-tools__command--danger"
            aria-label="清空本地草稿"
            disabled={busy}
            onClick={() => setDestructiveAction("clear")}
          >
            <Trash2 aria-hidden="true" size={20} />
            <span><strong>清空本地草稿</strong><small>删除当前浏览器保存的草稿与资源</small></span>
          </button> : null}
        </div>
      </div>

      {errors.length > 0 ? (
        <div className="data-tools__errors" role="alert">
          <strong>操作未完成</strong>
          <ul>
            {errors.map((error, index) => <li key={`${error}-${index}`}>{error}</li>)}
          </ul>
        </div>
      ) : null}

      <ConfirmDialog
        open={Boolean(pendingImport)}
        title="导入预览"
        description={pendingImport ? describePreview(pendingImport.preview, scope) : undefined}
        confirmLabel={busyAction === "replace" ? "正在替换..." : "替换当前草稿"}
        danger
        onCancel={() => {
          if (!busy) setPendingImport(undefined);
        }}
        onConfirm={() => {
          if (!busy) void replaceProject();
        }}
      />

      <ConfirmDialog
        open={destructiveAction === "restore"}
        title="恢复已发布版本"
        description={`当前${scope === "cloud" ? "云端草稿" : "本地修改"}将被《${publishedProject.title}》的发布快照替换。此操作无法撤销。`}
        confirmLabel={busyAction === "restore" ? "正在恢复..." : "确认恢复"}
        danger
        onCancel={() => {
          if (!busy) setDestructiveAction(undefined);
        }}
        onConfirm={() => {
          if (!busy) void runDestructiveAction("restore");
        }}
      />

      {allowClear ? <ConfirmDialog
        open={destructiveAction === "clear"}
        title="清空本地草稿"
        description="当前浏览器保存的草稿、编辑缓冲和本地媒体资源将被删除。此操作无法撤销。"
        confirmLabel={busyAction === "clear" ? "正在清空..." : "确认清空"}
        danger
        onCancel={() => {
          if (!busy) setDestructiveAction(undefined);
        }}
        onConfirm={() => {
          if (!busy) void runDestructiveAction("clear");
        }}
      /> : null}

      <ToastRegion messages={messages} />
    </section>
  );
}
