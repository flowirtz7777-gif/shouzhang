import { ArrowLeft, BookOpen, Map, Pencil, Sparkles } from "lucide-react";
import { lazy, Suspense, useContext, useState, type ReactNode } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { IconButton } from "../components/IconButton";
import type { AssetVariantName, PracticeAsset, PracticeProject } from "../domain/practice";
import { PracticeContext } from "./PracticeContext";
import { useReaderNavigation } from "./readerNavigation";

const DataTools = lazy(async () => ({
  default: (await import("../features/editor/DataTools")).DataTools,
}));
const EditorDrawer = lazy(async () => ({
  default: (await import("../features/editor/EditorDrawer")).EditorDrawer,
}));

export interface AppShellProps {
  editorEnabled: boolean;
  onEdit(): void;
  children?: ReactNode;
  headerTools?: ReactNode;
}

export function AppShell({ editorEnabled, onEdit, children, headerTools }: AppShellProps) {
  const practice = useContext(PracticeContext);
  const navigation = useReaderNavigation();
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorMounted, setEditorMounted] = useState(false);
  const [saveStatus, setSaveStatus] = useState(practice?.scope === "cloud" ? "云端草稿" : "本地草稿");
  const [projectRevision, setProjectRevision] = useState(0);
  const editableProject = practice?.draftProject ?? practice?.activeProject;

  function openEditor() {
    onEdit();
    if (practice) {
      setEditorMounted(true);
      setEditorOpen(true);
    }
  }

  async function saveProject(project: PracticeProject) {
    if (!practice) return;
    setSaveStatus("正在保存...");
    try {
      await practice.saveDraft(project);
      setSaveStatus(practice.scope === "cloud" ? "已保存到团队云端" : "已保存到当前浏览器");
    } catch (reason) {
      setSaveStatus(reason instanceof Error ? reason.message : "保存失败，请重试");
    }
  }

  async function storeBlobs(blobs: Map<string, Blob>) {
    if (!practice) return;
    for (const [key, blob] of blobs) {
      const separator = key.lastIndexOf(":");
      if (separator < 1) continue;
      const assetId = key.slice(0, separator);
      const variant = key.slice(separator + 1) as AssetVariantName;
      await practice.assets.put(assetId, variant, blob);
    }
  }

  async function storeAssetBlobs(asset: PracticeAsset, blobs: Map<string, Blob>) {
    if (practice?.storeAssetBlobs) {
      await practice.storeAssetBlobs(asset, blobs);
      return;
    }
    await storeBlobs(blobs);
  }

  async function replaceProject(project: PracticeProject, blobs: Map<string, Blob>) {
    if (!practice) return;
    setSaveStatus("正在替换...");
    try {
      await practice.replaceDraft(project, blobs);
      setProjectRevision((value) => value + 1);
      setSaveStatus(practice.scope === "cloud" ? "已替换并保存到团队云端" : "已替换并保存到当前浏览器");
    } catch {
      setSaveStatus("替换失败，原草稿已保留");
      throw new Error("替换失败，原草稿已保留");
    }
  }

  async function restorePublished() {
    if (!practice) return;
    await practice.restorePublished();
    setProjectRevision((value) => value + 1);
  }

  async function clearDraft() {
    if (!practice) return;
    await practice.clearDraft();
    setProjectRevision((value) => value + 1);
  }

  return (
    <div className="app-shell">
      <header className="app-header" role="banner">
        <NavLink className="brand" to={navigation.journeyPath} aria-label="回到高铁线路">
          <span className="brand__mark" aria-hidden="true"><Sparkles size={20} /></span>
          <span>
            <strong>我们的实践手账</strong>
            <small>一路记录，一路成长</small>
          </span>
        </NavLink>

        <nav className="primary-nav" aria-label="主要页面">
          <NavLink to={navigation.journeyPath} className={({ isActive }) => (isActive ? "is-active" : undefined)}>
            <Map aria-hidden="true" size={18} />
            高铁线路
          </NavLink>
          <NavLink to={navigation.journalPath} className={({ isActive }) => (isActive ? "is-active" : undefined)}>
            <BookOpen aria-hidden="true" size={18} />
            翻页手账
          </NavLink>
        </nav>

        <div className="app-header__tools">
          {headerTools}
          {navigation.overviewPath ? (
            <NavLink className="reader-back-button" to={navigation.overviewPath} title="返回手账概要" aria-label="返回手账概要">
              <ArrowLeft aria-hidden="true" size={17} />
              <span>概要</span>
            </NavLink>
          ) : null}
          {practice?.draftProject ? (
            <label className="draft-preview-toggle">
              <input
                type="checkbox"
                role="switch"
                aria-label={practice.scope === "cloud" ? "预览云端草稿" : "预览本地草稿"}
                checked={practice.previewDraft}
                onChange={(event) => practice.setPreviewDraft(event.target.checked)}
              />
              <span aria-hidden="true" />
              <strong>{practice.previewDraft ? "草稿" : "发布版"}</strong>
            </label>
          ) : null}
          {editorEnabled ? <IconButton icon={Pencil} label="编辑内容" onClick={openEditor} /> : null}
        </div>
      </header>

      <div className="app-shell__content">{children ?? <Outlet />}</div>

      {practice && editableProject && editorMounted ? (
        <Suspense fallback={<div className="editor-loading" role="status">正在打开内容编辑器...</div>}>
          <EditorDrawer
            open={editorOpen}
            project={editableProject}
            onProjectChange={saveProject}
            onClose={() => setEditorOpen(false)}
            onAssetBlobs={storeAssetBlobs}
            saveStatus={saveStatus}
            projectRevision={projectRevision}
            autosaveStorage={practice.draftAutosaveStorage}
            loadStoredBuffer={practice.scope !== "cloud"}
            eyebrow={practice.scope === "cloud" ? "TEAM CLOUD" : "LOCAL DRAFT"}
            footerNote={practice.scope === "cloud" ? "有效更改会自动保存到团队云端草稿" : "更改仅影响当前浏览器中的草稿"}
            dataTools={
              <Suspense fallback={<div className="editor-data-loading">正在载入数据工具...</div>}>
                <DataTools
                  project={editableProject}
                  publishedProject={practice.publishedProject}
                  getAssetBlob={(assetId, variant) => practice.assets.get(assetId, variant)}
                  onReplaceProject={replaceProject}
                  onRestorePublished={restorePublished}
                  onClearDraft={clearDraft}
                  scope={practice.scope === "cloud" ? "cloud" : "local"}
                  allowClear={practice.scope !== "cloud"}
                />
              </Suspense>
            }
          />
        </Suspense>
      ) : null}
    </div>
  );
}
