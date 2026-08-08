import { ImagePlus, Plus, Trash2, UserRound, X } from "lucide-react";
import { useState, type ChangeEvent, type KeyboardEvent } from "react";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import type { PracticeMember, PracticeProject } from "../../domain/practice";
import { processImage as defaultProcessImage } from "../../media/imageProcessor";
import { validateImageSource } from "../../media/imagePolicy";
import {
  createEditorUuid,
  mergeAssets,
  prepareEditorImage,
  type AssetBlobHandler,
  type EditorImageProcessor,
} from "./imageUpload";

export interface MemberManagerProps {
  project: PracticeProject;
  onChange(project: PracticeProject): void;
  processImage?: EditorImageProcessor;
  onAssetReady?: AssetBlobHandler;
}

export function MemberManager({
  project,
  onChange,
  processImage = defaultProcessImage,
  onAssetReady,
}: MemberManagerProps) {
  const [highlightDrafts, setHighlightDrafts] = useState<Record<string, string>>({});
  const [pendingDelete, setPendingDelete] = useState<PracticeMember>();
  const [error, setError] = useState("");
  const [uploadingMemberId, setUploadingMemberId] = useState<string>();

  function updateMember(memberId: string, patch: Partial<PracticeMember>) {
    onChange({
      ...project,
      members: project.members.map((member) =>
        member.id === memberId ? { ...member, ...patch, id: member.id } : member,
      ),
    });
    setError("");
  }

  function addMember() {
    const member: PracticeMember = {
      id: createEditorUuid(),
      name: `新成员 ${project.members.length + 1}`,
      highlights: [],
    };
    onChange({ ...project, members: [...project.members, member] });
  }

  function addHighlight(member: PracticeMember) {
    const value = (highlightDrafts[member.id] ?? "").trim();
    if (!value || member.highlights.includes(value)) return;
    updateMember(member.id, { highlights: [...member.highlights, value] });
    setHighlightDrafts((current) => ({ ...current, [member.id]: "" }));
  }

  function handleHighlightKeyDown(
    event: KeyboardEvent<HTMLInputElement>,
    member: PracticeMember,
  ) {
    if (event.key !== "Enter") return;
    event.preventDefault();
    addHighlight(member);
  }

  async function handleAvatarUpload(
    member: PracticeMember,
    event: ChangeEvent<HTMLInputElement>,
  ) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const policyError = validateImageSource({ bytes: file.size, width: 1, height: 1 });
    if (policyError) {
      setError(policyError);
      return;
    }

    setUploadingMemberId(member.id);
    setError("");
    try {
      const prepared = await prepareEditorImage(file, processImage);
      if (onAssetReady) await onAssetReady(prepared.asset, prepared.blobs);
      onChange({
        ...project,
        assets: mergeAssets(project.assets, [prepared.asset]),
        members: project.members.map((candidate) =>
          candidate.id === member.id
            ? { ...candidate, avatarAssetId: prepared.asset.id }
            : candidate,
        ),
      });
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "头像处理失败，请重试");
    } finally {
      setUploadingMemberId(undefined);
    }
  }

  function deleteMember(member: PracticeMember) {
    onChange({
      ...project,
      members: project.members.filter((candidate) => candidate.id !== member.id),
      entries: project.entries.map((entry) => ({
        ...entry,
        memberIds: entry.memberIds.filter((memberId) => memberId !== member.id),
      })),
    });
    setPendingDelete(undefined);
  }

  return (
    <section className="editor-form" aria-labelledby="member-manager-title">
      <div className="editor-section-heading editor-section-heading--action">
        <div>
          <span>COMPANIONS</span>
          <h3 id="member-manager-title">同行伙伴</h3>
        </div>
        <button type="button" className="editor-icon-command" onClick={addMember} aria-label="新增成员" title="新增成员">
          <Plus aria-hidden="true" size={18} />
        </button>
      </div>
      <p className="editor-help">成员头像和高光标签会汇集到手账末尾的成员墙。</p>

      <div className="editor-member-list">
        {project.members.map((member, index) => (
          <section className="editor-member-row" key={member.id} aria-label={`成员 ${member.name}`}>
            <div className="editor-member-row__topline">
              <div className="editor-member-avatar" aria-hidden="true">
                {member.name.trim().slice(0, 1) || <UserRound size={19} />}
              </div>
              <label className="editor-field editor-field--compact">
                <span>成员 {index + 1}</span>
                <input value={member.name} onChange={(event) => updateMember(member.id, { name: event.target.value })} />
              </label>
              <button type="button" className="editor-inline-danger" onClick={() => setPendingDelete(member)} aria-label={`删除${member.name}`} title="删除成员">
                <Trash2 aria-hidden="true" size={16} />
              </button>
            </div>

            <label className={`editor-avatar-upload ${uploadingMemberId === member.id ? "is-disabled" : ""}`}>
              <ImagePlus aria-hidden="true" size={16} />
              <span>{member.avatarAssetId ? "替换头像" : "上传头像"}</span>
              <input
                type="file"
                accept="image/*"
                disabled={uploadingMemberId === member.id}
                onChange={(event) => void handleAvatarUpload(member, event)}
              />
            </label>

            <div className="editor-highlight-list" aria-label={`${member.name}的高光标签`}>
              {member.highlights.map((highlight) => (
                <span key={highlight}>
                  {highlight}
                  <button
                    type="button"
                    onClick={() => updateMember(member.id, {
                      highlights: member.highlights.filter((value) => value !== highlight),
                    })}
                    aria-label={`移除标签${highlight}`}
                  >
                    <X aria-hidden="true" size={12} />
                  </button>
                </span>
              ))}
            </div>
            <div className="editor-add-highlight">
              <label className="editor-field editor-field--compact">
                <span>新增高光标签</span>
                <input
                  value={highlightDrafts[member.id] ?? ""}
                  onChange={(event) => setHighlightDrafts((current) => ({ ...current, [member.id]: event.target.value }))}
                  onKeyDown={(event) => handleHighlightKeyDown(event, member)}
                  placeholder="摄影记录 / 气氛担当"
                />
              </label>
              <button type="button" onClick={() => addHighlight(member)} aria-label={`为${member.name}添加高光标签`} title="添加标签">
                <Plus aria-hidden="true" size={16} />
              </button>
            </div>
          </section>
        ))}
      </div>

      {project.members.length === 0 ? <p className="editor-empty">团队名单还是空的，先添加第一位同行伙伴吧。</p> : null}
      {error ? <p className="editor-error" role="alert">{error}</p> : null}

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title="删除成员"
        description={pendingDelete ? `删除“${pendingDelete.name}”后，也会从所有活动中解除关联。` : undefined}
        confirmLabel="删除"
        danger
        onCancel={() => setPendingDelete(undefined)}
        onConfirm={() => pendingDelete && deleteMember(pendingDelete)}
      />
    </section>
  );
}
