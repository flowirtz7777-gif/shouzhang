import type {
  PracticeEntry,
  PracticeIcon,
  PracticePhoto,
  PracticeProject,
} from "../../domain/practice";
import { normalizeEntryOrder } from "../../domain/orderEntries";
import { draftProjectSchema } from "../../domain/practiceSchema";
import type { EditorAction } from "./editorReducer";

export type EditBufferStatus = "incomplete" | "ready";

export interface DraftEditBuffer<TValues extends object = Record<string, unknown>> {
  kind: string;
  entityId?: string;
  updatedAt: string;
  values: TValues;
  status: EditBufferStatus;
}

export interface EntryEditValues {
  id: string;
  phaseId: string;
  date: string;
  title: string;
  summary: string;
  body: string;
  location: string;
  icon: PracticeIcon;
  weather: string;
  mood: string;
  bgm?: { title: string; url: string };
  photos: PracticePhoto[];
  memberIds: string[];
  dayOrder: number;
}

export type EntryEditBuffer = DraftEditBuffer<EntryEditValues> & { kind: "entry" };

export type EntryBufferCommitResult =
  | { ok: true; action: Extract<EditorAction, { type: "entry/upsert" }>; entry: PracticeEntry }
  | { ok: false; errors: string[] };

const practiceIcons = new Set<PracticeIcon>([
  "research",
  "labor",
  "visit",
  "speech",
  "team",
]);

const calendarDatePattern = /^\d{4}-\d{2}-\d{2}$/;
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function createUuid(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (character) => {
    const random = Math.floor(Math.random() * 16);
    const value = character === "x" ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

function isCalendarDate(value: string): boolean {
  if (!calendarDatePattern.test(value)) return false;
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  const candidate = new Date(Date.UTC(year, month - 1, day));
  return (
    candidate.getUTCFullYear() === year &&
    candidate.getUTCMonth() === month - 1 &&
    candidate.getUTCDate() === day
  );
}

function required(value: string, message: string, errors: string[]): void {
  if (!value.trim()) errors.push(message);
}

export function getEntryBufferErrors(values: EntryEditValues): string[] {
  const errors: string[] = [];
  required(values.title, "请填写活动标题", errors);
  required(values.date, "请选择活动日期", errors);
  required(values.phaseId, "请选择所属章节", errors);
  required(values.summary, "请填写活动摘要", errors);
  required(values.body, "请填写活动正文", errors);

  if (values.date.trim() && !isCalendarDate(values.date)) {
    errors.push("请输入有效的活动日期");
  }
  if (!uuidPattern.test(values.id)) errors.push("活动编号无效");
  if (values.phaseId && !uuidPattern.test(values.phaseId)) errors.push("章节编号无效");
  if (!practiceIcons.has(values.icon)) errors.push("请选择活动图标");
  if (!Number.isInteger(values.dayOrder) || values.dayOrder < 0) {
    errors.push("同日顺序必须是非负整数");
  }
  if (values.bgm && (!values.bgm.title.trim() || !values.bgm.url.trim())) {
    errors.push("请同时填写 BGM 名称和链接");
  }
  if (values.photos.some((photo) => !photo.alt.trim())) {
    errors.push("请填写照片替代文本");
  }
  return [...new Set(errors)];
}

function normalizeEntryValues(
  source: Partial<PracticeEntry>,
): EntryEditValues {
  return {
    id: source.id ?? createUuid(),
    phaseId: source.phaseId ?? "",
    date: source.date ?? "",
    title: source.title ?? "",
    summary: source.summary ?? "",
    body: source.body ?? "",
    location: source.location ?? "",
    icon: source.icon ?? "research",
    weather: source.weather ?? "",
    mood: source.mood ?? "",
    bgm: source.bgm ? { ...source.bgm } : undefined,
    photos: (source.photos ?? []).map((photo) => ({ ...photo })),
    memberIds: [...(source.memberIds ?? [])],
    dayOrder: source.dayOrder ?? 0,
  };
}

export function createEntryBuffer(
  source: Partial<PracticeEntry> = {},
  updatedAt = new Date().toISOString(),
): EntryEditBuffer {
  const values = normalizeEntryValues(source);
  return {
    kind: "entry",
    entityId: source.id,
    updatedAt,
    values,
    status: getEntryBufferErrors(values).length === 0 ? "ready" : "incomplete",
  };
}

export function updateEntryBuffer(
  buffer: EntryEditBuffer,
  patch: Partial<EntryEditValues>,
  updatedAt = new Date().toISOString(),
): EntryEditBuffer {
  const values: EntryEditValues = {
    ...buffer.values,
    ...patch,
    bgm: Object.hasOwn(patch, "bgm")
      ? patch.bgm ? { ...patch.bgm } : undefined
      : buffer.values.bgm ? { ...buffer.values.bgm } : undefined,
    photos: (patch.photos ?? buffer.values.photos).map((photo) => ({ ...photo })),
    memberIds: [...(patch.memberIds ?? buffer.values.memberIds)],
  };
  return {
    ...buffer,
    updatedAt,
    values,
    status: getEntryBufferErrors(values).length === 0 ? "ready" : "incomplete",
  };
}

function toEntry(values: EntryEditValues): PracticeEntry {
  const entry: PracticeEntry = {
    id: values.id,
    phaseId: values.phaseId,
    date: values.date,
    title: values.title.trim(),
    summary: values.summary.trim(),
    body: values.body.trim(),
    icon: values.icon,
    photos: [...values.photos]
      .sort((left, right) => left.order - right.order || left.id.localeCompare(right.id))
      .map((photo, order) => ({ ...photo, alt: photo.alt.trim(), order })),
    memberIds: [...new Set(values.memberIds)],
    dayOrder: values.dayOrder,
  };

  const location = values.location.trim();
  const weather = values.weather.trim();
  const mood = values.mood.trim();
  if (location) entry.location = location;
  if (weather) entry.weather = weather;
  if (mood) entry.mood = mood;
  if (values.bgm) {
    entry.bgm = {
      title: values.bgm.title.trim(),
      url: values.bgm.url.trim(),
    };
  }
  return entry;
}

function formatProjectIssue(message: string): string {
  if (message.includes("phase order cannot decrease")) {
    return "活动顺序与章节顺序不一致";
  }
  if (message.includes("unknown phase")) return "活动引用了不存在的章节";
  if (message.includes("unknown member")) return "活动引用了不存在的成员";
  if (message.includes("unknown asset")) return "活动照片引用了不存在的资源";
  return "活动内容不符合项目约束";
}

export function commitEntryBuffer(
  project: PracticeProject,
  buffer: EntryEditBuffer,
): EntryBufferCommitResult {
  const errors = getEntryBufferErrors(buffer.values);
  if (!project.phases.some((phase) => phase.id === buffer.values.phaseId)) {
    errors.push("请选择有效的所属章节");
  }

  const memberIds = new Set(project.members.map((member) => member.id));
  if (buffer.values.memberIds.some((memberId) => !memberIds.has(memberId))) {
    errors.push("活动关联了不存在的成员");
  }

  const imageAssetIds = new Set(
    project.assets.filter((asset) => asset.kind === "image").map((asset) => asset.id),
  );
  if (buffer.values.photos.some((photo) => !imageAssetIds.has(photo.assetId))) {
    errors.push("活动照片引用了不存在的图片资源");
  }

  if (errors.length > 0) return { ok: false, errors: [...new Set(errors)] };

  const entry = toEntry(buffer.values);
  const existingIndex = project.entries.findIndex((candidate) => candidate.id === entry.id);
  const entries = existingIndex < 0
    ? [...project.entries, entry]
    : project.entries.map((candidate, index) => index === existingIndex ? entry : candidate);
  const validation = draftProjectSchema.safeParse({
    ...project,
    entries: normalizeEntryOrder(entries),
  });
  if (!validation.success) {
    return {
      ok: false,
      errors: [...new Set(validation.error.issues.map((issue) => formatProjectIssue(issue.message)))],
    };
  }

  const action = { type: "entry/upsert", entry } as const;
  return { ok: true, action, entry };
}

export function commitDraftBuffer(
  project: PracticeProject,
  buffer: DraftEditBuffer<object>,
): EntryBufferCommitResult | { ok: false; errors: string[] } {
  if (!isEntryEditBuffer(buffer)) {
    return { ok: false, errors: ["暂不支持此编辑缓冲类型"] };
  }
  return commitEntryBuffer(project, buffer);
}

function isEntryEditBuffer(
  buffer: DraftEditBuffer<object>,
): buffer is EntryEditBuffer {
  return buffer.kind === "entry";
}
