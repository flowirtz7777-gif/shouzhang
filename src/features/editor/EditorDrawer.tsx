import {
  Database,
  Flag,
  Mail,
  MapPin,
  Plus,
  Save,
  Settings,
  Trash2,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { getLatestStoredEditBuffer } from "../../data/db";
import type { FutureLetter, PracticeAsset, PracticeProject, ProjectMetadata } from "../../domain/practice";
import { processImage as defaultProcessImage } from "../../media/imageProcessor";
import { requestRecording as defaultRequestRecording } from "../../media/audioRecorder";
import { commitDraftBuffer, createEntryBuffer, type EntryEditBuffer } from "./editBuffer";
import { editorReducer, type EditorAction } from "./editorReducer";
import { EntryForm } from "./EntryForm";
import { FutureLetterForm, type FutureLetterRecordingRequester } from "./FutureLetterForm";
import {
  mergeAssets,
  type AssetBlobHandler,
  type EditorImageProcessor,
  type PreparedImage,
} from "./imageUpload";
import { MemberManager } from "./MemberManager";
import { PhaseManager } from "./PhaseManager";
import { ProjectForm } from "./ProjectForm";
import { indexedDbDraftAutosaveStorage, useDraftAutosave, type DraftAutosaveStorage } from "./useDraftAutosave";
import "./editor.css";

type EditorTab = "project" | "phases" | "entries" | "members" | "future" | "data";

interface TabDefinition {
  id: EditorTab;
  label: string;
  icon: LucideIcon;
}

const tabs: TabDefinition[] = [
  { id: "project", label: "项目设置", icon: Settings },
  { id: "phases", label: "章节管理", icon: Flag },
  { id: "entries", label: "活动管理", icon: MapPin },
  { id: "members", label: "成员管理", icon: Users },
  { id: "future", label: "未来信箱", icon: Mail },
  { id: "data", label: "数据工具", icon: Database },
];

export interface EditorDrawerProps {
  open: boolean;
  project: PracticeProject;
  onProjectChange(project: PracticeProject): void | Promise<void>;
  onClose(): void;
  processImage?: EditorImageProcessor;
  requestRecording?: FutureLetterRecordingRequester;
  onAssetBlobs?: AssetBlobHandler;
  saveStatus?: string;
  dataTools?: ReactNode;
  projectRevision?: number;
  autosaveStorage?: DraftAutosaveStorage;
  loadStoredBuffer?: boolean;
  footerNote?: string;
  eyebrow?: string;
}

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((element) => !element.closest('[hidden]'));
}

function initialEntryBuffer(project: PracticeProject): EntryEditBuffer {
  const first = [...project.entries].sort(
    (left, right) => left.date.localeCompare(right.date) || left.dayOrder - right.dayOrder,
  )[0];
  if (first) return createEntryBuffer(first);
  return createEntryBuffer({
    phaseId: project.phases[0]?.id ?? "",
    date: project.startDate,
    dayOrder: 0,
  });
}

export function EditorDrawer({
  open,
  project,
  onProjectChange,
  onClose,
  processImage = defaultProcessImage,
  requestRecording = defaultRequestRecording,
  onAssetBlobs,
  saveStatus = "本地草稿",
  dataTools,
  projectRevision = 0,
  autosaveStorage = indexedDbDraftAutosaveStorage,
  loadStoredBuffer = true,
  footerNote = "更改仅影响当前浏览器中的草稿",
  eyebrow = "LOCAL DRAFT",
}: EditorDrawerProps) {
  const titleId = useId();
  const drawerRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const wasOpenRef = useRef(false);
  const pendingAssetsRef = useRef(new Map<string, PracticeAsset>());
  const hydratedBufferRef = useRef(false);
  const revisionRef = useRef(projectRevision);
  const [activeTab, setActiveTab] = useState<EditorTab>("project");
  const [entryBuffer, setEntryBuffer] = useState(() => initialEntryBuffer(project));
  const entryBufferRef = useRef(entryBuffer);
  const [entryBufferDirty, setEntryBufferDirty] = useState(false);
  const entryBufferDirtyRef = useRef(false);
  const [entryFormRevision, setEntryFormRevision] = useState(0);
  const [pendingEntryDelete, setPendingEntryDelete] = useState(false);
  const autosave = useDraftAutosave({
    buffer: entryBuffer,
    project,
    enabled: entryBufferDirty,
    storage: autosaveStorage,
  });

  const replaceEntryBuffer = useCallback((
    buffer: EntryEditBuffer,
    dirty: boolean,
    rebuildForm = false,
  ) => {
    entryBufferRef.current = buffer;
    entryBufferDirtyRef.current = dirty;
    setEntryBuffer(buffer);
    setEntryBufferDirty(dirty);
    if (rebuildForm) setEntryFormRevision((value) => value + 1);
  }, []);

  useEffect(() => {
    if (!open || !loadStoredBuffer || hydratedBufferRef.current) return;
    let active = true;
    void getLatestStoredEditBuffer("entry").then((stored) => {
      if (!active || !stored) return;
      try {
        const restored = createEntryBuffer(
          stored.values as Partial<import("../../domain/practice").PracticeEntry>,
          stored.updatedAt,
        );
        replaceEntryBuffer({ ...restored, entityId: stored.entityId }, false, true);
      } catch {
        // Invalid local buffers are ignored; the valid project remains authoritative.
      }
    }).catch(() => {
      // The valid project remains usable if local recovery storage is unavailable.
    }).finally(() => {
      if (active) hydratedBufferRef.current = true;
    });
    return () => {
      active = false;
    };
  }, [loadStoredBuffer, open, projectRevision, replaceEntryBuffer]);

  useEffect(() => {
    if (revisionRef.current === projectRevision) return;
    revisionRef.current = projectRevision;
    pendingAssetsRef.current.clear();
    replaceEntryBuffer(initialEntryBuffer(project), false, true);
  }, [project, projectRevision, replaceEntryBuffer]);

  useEffect(() => {
    if (open && !wasOpenRef.current) {
      triggerRef.current = document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
      queueMicrotask(() => closeRef.current?.focus());
    }
    if (!open && wasOpenRef.current) {
      queueMicrotask(() => triggerRef.current?.focus());
    }
    wasOpenRef.current = open;
  }, [open]);

  useEffect(
    () => () => {
      triggerRef.current?.focus();
    },
    [],
  );

  if (!open) return null;

  async function closeEditor() {
    try {
      if (entryBufferDirtyRef.current) {
        await autosaveStorage.saveBuffer(entryBufferRef.current);
        const committed = commitDraftBuffer(project, entryBufferRef.current);
        if (committed.ok) {
          await onProjectChange(editorReducer(project, committed.action));
        }
      }
    } finally {
      onClose();
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      void closeEditor();
      return;
    }
    if (event.key !== "Tab" || !drawerRef.current) return;
    const focusable = getFocusableElements(drawerRef.current);
    if (!focusable.length) {
      event.preventDefault();
      drawerRef.current.focus();
      return;
    }
    const first = focusable[0]!;
    const last = focusable.at(-1)!;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function applyAction(action: EditorAction, additions: PracticeAsset[] = []) {
    const pending = [...pendingAssetsRef.current.values()];
    const source = additions.length || pending.length
      ? { ...project, assets: mergeAssets(project.assets, [...pending, ...additions]) }
      : project;
    const next = editorReducer(source, action);
    onProjectChange(next);
    pendingAssetsRef.current.clear();
  }

  async function handleAssetReady(asset: PracticeAsset, blobs: Map<string, Blob>) {
    pendingAssetsRef.current.set(asset.id, asset);
    await onAssetBlobs?.(asset, blobs);
    await onProjectChange({ ...project, assets: mergeAssets(project.assets, [asset]) });
  }

  function handleProjectChange(patch: Partial<ProjectMetadata>) {
    applyAction({ type: "project/update", patch });
  }

  function handleFutureLetterChange(futureLetter?: FutureLetter) {
    applyAction({ type: "future-letter/update", futureLetter });
  }

  function selectEntry(entryId: string) {
    const entry = project.entries.find((candidate) => candidate.id === entryId);
    if (entry) {
      replaceEntryBuffer(createEntryBuffer(entry), false, true);
    }
  }

  function createNewEntry() {
    const sameDateCount = project.entries.filter((entry) => entry.date === project.startDate).length;
    replaceEntryBuffer(createEntryBuffer({
      phaseId: project.phases[0]?.id ?? "",
      date: project.startDate,
      dayOrder: sameDateCount,
    }), true, true);
  }

  function commitEntry(
    action: Extract<EditorAction, { type: "entry/upsert" }>,
    uploads: PreparedImage[],
  ) {
    applyAction(action, uploads.map((item) => item.asset));
    replaceEntryBuffer(createEntryBuffer(action.entry), false, true);
  }

  function deleteCurrentEntry() {
    const entryId = entryBuffer.entityId;
    if (!entryId) return;
    const remaining = project.entries.filter((entry) => entry.id !== entryId);
    applyAction({ type: "entry/delete", entryId });
    replaceEntryBuffer(remaining[0]
      ? createEntryBuffer(remaining[0])
      : createEntryBuffer({
          phaseId: project.phases[0]?.id ?? "",
          date: project.startDate,
          dayOrder: 0,
        }), false, true);
    setPendingEntryDelete(false);
  }

  return (
    <>
      <div className="editor-backdrop" aria-hidden="true" onMouseDown={() => void closeEditor()} />
      <aside
        ref={drawerRef}
        className="editor-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={handleKeyDown}
      >
        <header className="editor-drawer__header">
          <div>
            <span>{eyebrow}</span>
            <h2 id={titleId}>内容编辑器</h2>
          </div>
          <button ref={closeRef} type="button" className="editor-close-button" onClick={() => void closeEditor()} aria-label="关闭内容编辑器" title="关闭">
            <X aria-hidden="true" size={20} />
          </button>
        </header>

        <nav className="editor-tabs" role="tablist" aria-label="编辑区域">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={activeTab === id}
              aria-controls={`editor-panel-${id}`}
              id={`editor-tab-${id}`}
              data-tooltip={label}
              title={label}
              onClick={() => setActiveTab(id)}
            >
              <Icon aria-hidden="true" size={17} />
              <span className="sr-only">{label}</span>
            </button>
          ))}
        </nav>

        <div className="editor-drawer__content">
          {activeTab === "project" ? (
            <div role="tabpanel" id="editor-panel-project" aria-labelledby="editor-tab-project">
              <ProjectForm project={project} onChange={handleProjectChange} />
            </div>
          ) : null}
          {activeTab === "phases" ? (
            <div role="tabpanel" id="editor-panel-phases" aria-labelledby="editor-tab-phases">
              <PhaseManager project={project} onChange={onProjectChange} />
            </div>
          ) : null}
          {activeTab === "entries" ? (
          <div role="tabpanel" id="editor-panel-entries" aria-labelledby="editor-tab-entries">
            <div className="editor-entry-toolbar">
              <label className="editor-field editor-field--compact">
                <span>选择活动</span>
                <select
                  value={entryBuffer.entityId ?? ""}
                  onChange={(event) => selectEntry(event.target.value)}
                >
                  {!entryBuffer.entityId ? <option value="">正在新增活动</option> : null}
                  {[...project.entries]
                    .sort((left, right) => left.date.localeCompare(right.date) || left.dayOrder - right.dayOrder)
                    .map((entry) => <option key={entry.id} value={entry.id}>{entry.date} · {entry.title}</option>)}
                </select>
              </label>
              <button type="button" onClick={createNewEntry} aria-label="新增活动" title="新增活动">
                <Plus aria-hidden="true" size={17} />
              </button>
              <button
                type="button"
                className="is-danger"
                disabled={!entryBuffer.entityId}
                onClick={() => setPendingEntryDelete(true)}
                aria-label="删除当前活动"
                title="删除当前活动"
              >
                <Trash2 aria-hidden="true" size={17} />
              </button>
            </div>
            <EntryForm
              key={`${entryFormRevision}:${entryBuffer.values.id}`}
              project={project}
              buffer={entryBuffer}
              onBufferChange={(buffer) => {
                replaceEntryBuffer(buffer, true);
              }}
              onCommit={commitEntry}
              processImage={processImage}
              onAssetReady={handleAssetReady}
            />
          </div>
          ) : null}
          {activeTab === "members" ? (
            <div role="tabpanel" id="editor-panel-members" aria-labelledby="editor-tab-members">
              <MemberManager
                project={project}
                onChange={onProjectChange}
                processImage={processImage}
                onAssetReady={handleAssetReady}
              />
            </div>
          ) : null}
          {activeTab === "future" ? (
            <div role="tabpanel" id="editor-panel-future" aria-labelledby="editor-tab-future">
              <FutureLetterForm
                value={project.futureLetter}
                onChange={handleFutureLetterChange}
                requestRecording={requestRecording}
                onAudioReady={handleAssetReady}
              />
            </div>
          ) : null}
          {activeTab === "data" ? (
          <div role="tabpanel" id="editor-panel-data" aria-labelledby="editor-tab-data">
            {dataTools ?? <section className="editor-form">
              <div className="editor-section-heading">
                <div>
                  <span>PORTABLE DATA</span>
                  <h3>数据工具</h3>
                </div>
                <p>完整的导入、导出和恢复操作将在这里集中管理。</p>
              </div>
              <div className="editor-data-placeholder">
                <Database aria-hidden="true" size={26} />
                <strong>项目内容保存在当前浏览器</strong>
                <span>发布前可导出结构数据和包含资源的完整发布包。</span>
              </div>
            </section>}
          </div>
          ) : null}
        </div>

        <footer className="editor-drawer__footer" {...autosave.liveRegionProps}>
          <Save aria-hidden="true" size={15} />
          <span>{autosave.message || saveStatus}</span>
          <small>{footerNote}</small>
        </footer>
      </aside>

      <ConfirmDialog
        open={pendingEntryDelete}
        title="删除活动"
        description={`确定删除“${entryBuffer.values.title || "未命名活动"}”吗？照片资源会在没有其他引用时再清理。`}
        confirmLabel="删除"
        danger
        onCancel={() => setPendingEntryDelete(false)}
        onConfirm={deleteCurrentEntry}
      />
    </>
  );
}
