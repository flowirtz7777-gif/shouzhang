import { ChevronDown, ChevronUp, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import type { PracticePhase, PracticeProject } from "../../domain/practice";
import { createEditorUuid } from "./imageUpload";

export interface PhaseManagerProps {
  project: PracticeProject;
  onChange(project: PracticeProject): void;
}

const phaseColors = ["#F1C659", "#70B5AD", "#EE785B", "#8FBD78", "#7EA8D8"];

function orderedPhases(project: PracticeProject): PracticePhase[] {
  return [...project.phases].sort(
    (left, right) => left.order - right.order || left.id.localeCompare(right.id),
  );
}

export function PhaseManager({ project, onChange }: PhaseManagerProps) {
  const [error, setError] = useState("");
  const [pendingDelete, setPendingDelete] = useState<PracticePhase>();
  const phases = orderedPhases(project);

  function replacePhases(next: PracticePhase[]) {
    onChange({
      ...project,
      phases: next.map((phase, order) => ({ ...phase, order })),
    });
    setError("");
  }

  function addPhase() {
    const next: PracticePhase = {
      id: createEditorUuid(),
      title: `新章节 ${phases.length + 1}`,
      color: phaseColors[phases.length % phaseColors.length]!,
      order: phases.length,
    };
    replacePhases([...phases, next]);
  }

  function updatePhase(phaseId: string, patch: Partial<PracticePhase>) {
    replacePhases(
      phases.map((phase) => phase.id === phaseId ? { ...phase, ...patch, id: phase.id } : phase),
    );
  }

  function movePhase(index: number, direction: -1 | 1) {
    const destination = index + direction;
    if (destination < 0 || destination >= phases.length) return;
    const next = [...phases];
    const current = next[index];
    const target = next[destination];
    if (!current || !target) return;
    next[index] = target;
    next[destination] = current;
    replacePhases(next);
  }

  function requestDelete(phase: PracticePhase) {
    if (project.entries.some((entry) => entry.phaseId === phase.id)) {
      setError("请先移动或删除该章节中的活动");
      return;
    }
    setPendingDelete(phase);
  }

  return (
    <section className="editor-form" aria-labelledby="phase-manager-title">
      <div className="editor-section-heading editor-section-heading--action">
        <div>
          <span>CHAPTERS</span>
          <h3 id="phase-manager-title">章节管理</h3>
        </div>
        <button type="button" className="editor-icon-command" onClick={addPhase} aria-label="新增章节" title="新增章节">
          <Plus aria-hidden="true" size={18} />
        </button>
      </div>
    <p className="editor-help">章节顺序也决定铁路线路上的故事推进顺序。</p>

      <div className="editor-manager-list">
        {phases.map((phase, index) => (
          <div className="editor-manager-row" key={phase.id}>
            <label className="editor-color-field" title="章节颜色">
              <span className="sr-only">{phase.title}颜色</span>
              <input
                type="color"
                value={phase.color}
                onChange={(event) => updatePhase(phase.id, { color: event.target.value.toUpperCase() })}
              />
            </label>
            <label className="editor-field editor-field--compact">
              <span>章节 {index + 1}</span>
              <input
                value={phase.title}
                onChange={(event) => updatePhase(phase.id, { title: event.target.value })}
              />
            </label>
            <div className="editor-row-actions">
              <button
                type="button"
                disabled={index === 0}
                onClick={() => movePhase(index, -1)}
                aria-label={`上移${phase.title}`}
                title="上移"
              >
                <ChevronUp aria-hidden="true" size={16} />
              </button>
              <button
                type="button"
                disabled={index === phases.length - 1}
                onClick={() => movePhase(index, 1)}
                aria-label={`下移${phase.title}`}
                title="下移"
              >
                <ChevronDown aria-hidden="true" size={16} />
              </button>
              <button
                type="button"
                className="is-danger"
                onClick={() => requestDelete(phase)}
                aria-label={`删除${phase.title}`}
                title="删除章节"
              >
                <Trash2 aria-hidden="true" size={16} />
              </button>
            </div>
          </div>
        ))}
      </div>

      {error ? <p className="editor-error" role="alert">{error}</p> : null}
      {phases.length === 0 ? <p className="editor-empty">至少添加一个章节后才能创建活动。</p> : null}

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title="删除章节"
        description={pendingDelete ? `确定删除“${pendingDelete.title}”吗？` : undefined}
        confirmLabel="删除"
        danger
        onCancel={() => setPendingDelete(undefined)}
        onConfirm={() => {
          if (pendingDelete) replacePhases(phases.filter((phase) => phase.id !== pendingDelete.id));
          setPendingDelete(undefined);
        }}
      />
    </section>
  );
}
