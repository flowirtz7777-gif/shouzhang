import { ChevronDown, ChevronUp, ImagePlus, Trash2 } from "lucide-react";
import { useMemo, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import type { PracticeIcon, PracticePhoto, PracticeProject } from "../../domain/practice";
import type { EditorAction } from "./editorReducer";
import { validateImageSource } from "../../media/imagePolicy";
import {
  commitEntryBuffer,
  updateEntryBuffer,
  type EntryEditBuffer,
  type EntryEditValues,
} from "./editBuffer";
import {
  createEditorUuid,
  mergeAssets,
  prepareEditorImage,
  type AssetBlobHandler,
  type EditorImageProcessor,
  type PreparedImage,
} from "./imageUpload";

export interface EntryFormProps {
  project: PracticeProject;
  buffer: EntryEditBuffer;
  onBufferChange(buffer: EntryEditBuffer): void;
  onCommit(
    action: Extract<EditorAction, { type: "entry/upsert" }>,
    assets: PreparedImage[],
  ): void;
  processImage: EditorImageProcessor;
  onAssetReady?: AssetBlobHandler;
}

const iconOptions: Array<{ value: PracticeIcon; label: string }> = [
  { value: "research", label: "调研 · 放大镜" },
  { value: "labor", label: "劳动 · 工具" },
  { value: "visit", label: "走访 · 握手" },
  { value: "speech", label: "分享 · 对话" },
  { value: "team", label: "团队 · 伙伴" },
];

function getResourceBytes(project: PracticeProject, staged: PreparedImage[]): number {
  const assets = mergeAssets(project.assets, staged.map((item) => item.asset));
  return assets.reduce((total, asset) => {
    const variants = Object.values(asset.variants);
    return total + variants.reduce((assetTotal, variant) => assetTotal + (variant?.byteSize ?? 0), 0);
  }, 0);
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(0.1, bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function EntryForm({
  project,
  buffer,
  onBufferChange,
  onCommit,
  processImage,
  onAssetReady,
}: EntryFormProps) {
  const [draft, setDraft] = useState(buffer);
  const draftRef = useRef(buffer);
  const [stagedImages, setStagedImages] = useState<PreparedImage[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);

  const resourceUsage = useMemo(
    () => formatBytes(getResourceBytes(project, stagedImages)),
    [project, stagedImages],
  );

  function patch(values: Partial<EntryEditValues>) {
    const next = updateEntryBuffer(draftRef.current, values);
    draftRef.current = next;
    setDraft(next);
    onBufferChange(next);
    setErrors([]);
  }

  function updatePhotos(updater: (photos: PracticePhoto[]) => PracticePhoto[]) {
    const current = draftRef.current;
    const photos = updater(current.values.photos.map((photo) => ({ ...photo })))
      .map((photo, order) => ({ ...photo, order }));
    const next = updateEntryBuffer(current, { photos });
    draftRef.current = next;
    setDraft(next);
    onBufferChange(next);
    setErrors([]);
  }

  async function handlePhotoUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const policyError = validateImageSource({ bytes: file.size, width: 1, height: 1 });
    if (policyError) {
      setErrors([policyError]);
      return;
    }

    setUploading(true);
    setErrors([]);
    try {
      const prepared = await prepareEditorImage(file, processImage);
      await onAssetReady?.(prepared.asset, prepared.blobs);
      setStagedImages((current) => {
        const byId = new Map(current.map((item) => [item.asset.id, item]));
        byId.set(prepared.asset.id, prepared);
        return [...byId.values()];
      });
      updatePhotos((photos) => [
        ...photos,
        {
          id: createEditorUuid(),
          assetId: prepared.asset.id,
          alt: "",
          caption: "",
          order: photos.length,
        },
      ]);
    } catch (error) {
      setErrors([error instanceof Error ? error.message : "图片处理失败，请重新上传"]);
    } finally {
      setUploading(false);
    }
  }

  function updateBgm(field: "title" | "url", value: string) {
    const current = draft.values.bgm ?? { title: "", url: "" };
    const bgm = { ...current, [field]: value };
    patch({ bgm: bgm.title || bgm.url ? bgm : undefined });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const projectWithAssets = {
      ...project,
      assets: mergeAssets(project.assets, stagedImages.map((item) => item.asset)),
    };
    const result = commitEntryBuffer(projectWithAssets, draftRef.current);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    onCommit(result.action, stagedImages);
    setErrors([]);
  }

  return (
    <form className="editor-form" onSubmit={handleSubmit} noValidate>
      <div className="editor-section-heading">
        <div>
          <span>ACTIVITY</span>
          <h3>{buffer.entityId ? "编辑活动" : "新增活动"}</h3>
        </div>
    <p>活动会按日期和同日顺序从左向右排在铁路线路上。</p>
      </div>

      <div className="editor-field-grid">
        <label className="editor-field">
          <span>活动日期</span>
          <input type="date" value={draft.values.date} onChange={(event) => patch({ date: event.target.value })} />
        </label>
        <label className="editor-field">
          <span>同日顺序</span>
          <input
            type="number"
            min={0}
            step={1}
            value={draft.values.dayOrder}
            onChange={(event) => patch({ dayOrder: Math.max(0, Number(event.target.value) || 0) })}
          />
        </label>
      </div>
      <label className="editor-field">
        <span>所属章节</span>
        <select value={draft.values.phaseId} onChange={(event) => patch({ phaseId: event.target.value })}>
          <option value="">请选择章节</option>
          {[...project.phases].sort((a, b) => a.order - b.order).map((phase) => (
            <option key={phase.id} value={phase.id}>{phase.title}</option>
          ))}
        </select>
      </label>
      <label className="editor-field">
        <span>活动标题</span>
        <input value={draft.values.title} onChange={(event) => patch({ title: event.target.value })} />
      </label>
      <label className="editor-field">
        <span>一句摘要</span>
        <textarea rows={2} value={draft.values.summary} onChange={(event) => patch({ summary: event.target.value })} />
      </label>
      <label className="editor-field">
        <span>活动正文</span>
        <textarea rows={6} value={draft.values.body} onChange={(event) => patch({ body: event.target.value })} />
      </label>
      <label className="editor-field">
        <span>地点</span>
        <input value={draft.values.location} onChange={(event) => patch({ location: event.target.value })} />
      </label>
      <label className="editor-field">
        <span>活动图标</span>
        <select value={draft.values.icon} onChange={(event) => patch({ icon: event.target.value as PracticeIcon })}>
          {iconOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </label>
      <div className="editor-field-grid">
        <label className="editor-field">
          <span>天气</span>
          <input value={draft.values.weather} onChange={(event) => patch({ weather: event.target.value })} placeholder="晴 / 多云" />
        </label>
        <label className="editor-field">
          <span>心情</span>
          <input value={draft.values.mood} onChange={(event) => patch({ mood: event.target.value })} placeholder="期待 / 踏实" />
        </label>
      </div>

      <fieldset className="editor-fieldset">
        <legend>今日 BGM（可选）</legend>
        <label className="editor-field">
          <span>曲目名称</span>
          <input value={draft.values.bgm?.title ?? ""} onChange={(event) => updateBgm("title", event.target.value)} />
        </label>
        <label className="editor-field">
          <span>播放链接</span>
          <input
            type="url"
            value={draft.values.bgm?.url ?? ""}
            onChange={(event) => updateBgm("url", event.target.value)}
            placeholder="https://example.com/music.mp3"
            aria-describedby="bgm-link-help"
          />
          <small id="bgm-link-help" className="editor-field__hint">
            音频直链可在手账内播放；网易云、百度音乐等分享页会打开音乐平台。
          </small>
        </label>
      </fieldset>

      <fieldset className="editor-fieldset">
        <legend>同行伙伴</legend>
        {project.members.length ? (
          <div className="editor-check-grid">
            {project.members.map((member) => (
              <label key={member.id}>
                <input
                  type="checkbox"
                  checked={draft.values.memberIds.includes(member.id)}
                  onChange={(event) => patch({
                    memberIds: event.target.checked
                      ? [...draft.values.memberIds, member.id]
                      : draft.values.memberIds.filter((id) => id !== member.id),
                  })}
                />
                <span>{member.name}</span>
              </label>
            ))}
          </div>
        ) : <p className="editor-empty">还没有成员，可稍后在成员管理中添加。</p>}
      </fieldset>

      <section className="editor-photo-editor" aria-labelledby="entry-photo-title">
        <div className="editor-subheading">
          <div>
            <h4 id="entry-photo-title">活动照片</h4>
            <small>当前资源占用约 {resourceUsage}</small>
          </div>
          <label className={`editor-upload-button ${uploading ? "is-disabled" : ""}`}>
            <ImagePlus aria-hidden="true" size={17} />
            <span>{uploading ? "处理中" : "上传"}</span>
            <input
              type="file"
              accept="image/*"
              aria-label="上传照片"
              disabled={uploading}
              onChange={handlePhotoUpload}
            />
          </label>
        </div>

        <div className="editor-photo-list">
          {draft.values.photos.map((photo, index) => (
            <div className="editor-photo-row" key={photo.id}>
              <div className="editor-photo-row__number">{index + 1}</div>
              <div className="editor-photo-row__fields">
                <label className="editor-field editor-field--compact">
                  <span>照片替代文本</span>
                  <input
                    value={photo.alt}
                    onChange={(event) => updatePhotos((photos) => photos.map((item) => item.id === photo.id ? { ...item, alt: event.target.value } : item))}
                    placeholder="描述画面中发生了什么"
                  />
                </label>
                <label className="editor-field editor-field--compact">
                  <span>图片说明</span>
                  <input
                    value={photo.caption ?? ""}
                    onChange={(event) => updatePhotos((photos) => photos.map((item) => item.id === photo.id ? { ...item, caption: event.target.value } : item))}
                  />
                </label>
              </div>
              <div className="editor-row-actions editor-row-actions--vertical">
                <button type="button" disabled={index === 0} aria-label={`上移第${index + 1}张照片`} onClick={() => updatePhotos((photos) => {
                  const target = photos[index - 1];
                  const current = photos[index];
                  if (!target || !current) return photos;
                  photos[index - 1] = current;
                  photos[index] = target;
                  return photos;
                })}><ChevronUp aria-hidden="true" size={15} /></button>
                <button type="button" disabled={index === draft.values.photos.length - 1} aria-label={`下移第${index + 1}张照片`} onClick={() => updatePhotos((photos) => {
                  const target = photos[index + 1];
                  const current = photos[index];
                  if (!target || !current) return photos;
                  photos[index + 1] = current;
                  photos[index] = target;
                  return photos;
                })}><ChevronDown aria-hidden="true" size={15} /></button>
                <button type="button" className="is-danger" aria-label={`删除第${index + 1}张照片`} onClick={() => updatePhotos((photos) => photos.filter((item) => item.id !== photo.id))}><Trash2 aria-hidden="true" size={15} /></button>
              </div>
            </div>
          ))}
          {draft.values.photos.length === 0 ? <p className="editor-empty">上传照片后，可在这里补充替代文本和说明。</p> : null}
        </div>
      </section>

      {errors.length ? (
        <div className="editor-error-list" role="alert">
          {errors.map((error) => <p key={error}>{error}</p>)}
        </div>
      ) : null}
      <button type="submit" className="editor-primary-button">保存活动</button>
    </form>
  );
}
