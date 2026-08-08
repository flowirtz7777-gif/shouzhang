import { useState, type FormEvent } from "react";
import type { PracticeProject, ProjectMetadata } from "../../domain/practice";

export interface ProjectFormProps {
  project: PracticeProject;
  onChange(patch: Partial<ProjectMetadata>): void;
}

function metadataFrom(project: PracticeProject): ProjectMetadata {
  const metadata: ProjectMetadata = {
    title: project.title,
    subtitle: project.subtitle,
    heroTitle: project.heroTitle,
    heroDescription: project.heroDescription,
    startDate: project.startDate,
    timeZone: project.timeZone,
  };
  if (project.endDate) metadata.endDate = project.endDate;
  return metadata;
}

export function ProjectForm({ project, onChange }: ProjectFormProps) {
  const [values, setValues] = useState(() => metadataFrom(project));
  const [error, setError] = useState("");

  function update<Key extends keyof ProjectMetadata>(
    key: Key,
    value: ProjectMetadata[Key],
  ) {
    setValues((current) => ({ ...current, [key]: value }));
    setError("");
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const required = [values.title, values.subtitle, values.heroTitle, values.heroDescription];
    if (required.some((value) => !value.trim())) {
      setError("请完整填写项目名称与首屏文字");
      return;
    }
    if (values.endDate && values.endDate < values.startDate) {
      setError("结束日期不能早于开始日期");
      return;
    }
    onChange({
      ...values,
      title: values.title.trim(),
      subtitle: values.subtitle.trim(),
      heroTitle: values.heroTitle.trim(),
      heroDescription: values.heroDescription.trim(),
      endDate: values.endDate || undefined,
      timeZone: values.timeZone || "Asia/Shanghai",
    });
  }

  return (
    <form className="editor-form" onSubmit={handleSubmit}>
      <div className="editor-section-heading">
        <div>
          <span>PROJECT</span>
          <h3>项目设置</h3>
        </div>
    <p>这些文字会出现在导航和铁路线路首屏。</p>
      </div>

      <label className="editor-field">
        <span>平台名称</span>
        <input
          required
          value={values.title}
          onChange={(event) => update("title", event.target.value)}
        />
      </label>
      <label className="editor-field">
        <span>副标题</span>
        <input
          required
          value={values.subtitle}
          onChange={(event) => update("subtitle", event.target.value)}
        />
      </label>
      <label className="editor-field">
        <span>首屏标题</span>
        <input
          required
          value={values.heroTitle}
          onChange={(event) => update("heroTitle", event.target.value)}
        />
      </label>
      <label className="editor-field">
        <span>首屏说明</span>
        <textarea
          required
          rows={4}
          value={values.heroDescription}
          onChange={(event) => update("heroDescription", event.target.value)}
        />
      </label>
      <div className="editor-field-grid">
        <label className="editor-field">
          <span>开始日期</span>
          <input
            required
            type="date"
            value={values.startDate}
            onChange={(event) => update("startDate", event.target.value)}
          />
        </label>
        <label className="editor-field">
          <span>结束日期</span>
          <input
            type="date"
            value={values.endDate ?? ""}
            onChange={(event) => update("endDate", event.target.value || undefined)}
          />
        </label>
      </div>
      <label className="editor-field">
        <span>项目时区</span>
        <select
          value={values.timeZone || "Asia/Shanghai"}
          onChange={(event) => update("timeZone", event.target.value)}
        >
          <option value="Asia/Shanghai">中国标准时间（Asia/Shanghai）</option>
          <option value="Asia/Hong_Kong">香港时间（Asia/Hong_Kong）</option>
          <option value="Asia/Tokyo">东京时间（Asia/Tokyo）</option>
          <option value="UTC">协调世界时（UTC）</option>
        </select>
      </label>

      {error ? <p className="editor-error" role="alert">{error}</p> : null}
      <button type="submit" className="editor-primary-button">保存项目设置</button>
    </form>
  );
}
