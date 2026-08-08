import { z } from "zod";
import type { PracticeAsset, PracticeEntry, PracticeProject } from "./practice";

const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const offsetDateTimePattern =
  /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?[+-](\d{2}):(\d{2})$/;

const dateSchema = z.string().refine(isCalendarDate, "must be a valid YYYY-MM-DD date");
const uuidSchema = z.string().uuid();

const assetVariantSchema = z.object({
  path: z.string().refine(isRelativePath, "asset variant path must be relative").optional(),
  byteSize: z.number().int().nonnegative(),
  mimeType: z.string().min(1),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
});

const assetSchema = z.object({
  id: uuidSchema,
  kind: z.enum(["image", "audio"]),
  mimeType: z.string().min(1),
  originalName: z.string().min(1),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  durationSeconds: z.number().nonnegative().optional(),
  variants: z.object({
    thumbnail: assetVariantSchema.optional(),
    display: assetVariantSchema.optional(),
    audio: assetVariantSchema.optional(),
  }),
});

const photoSchema = z.object({
  id: uuidSchema,
  assetId: uuidSchema,
  alt: z.string().min(1),
  caption: z.string().optional(),
  order: z.number().int().nonnegative(),
});

const entrySchema = z.object({
  id: uuidSchema,
  phaseId: uuidSchema,
  date: dateSchema,
  title: z.string().min(1),
  summary: z.string().min(1),
  body: z.string().min(1),
  location: z.string().optional(),
  icon: z.enum(["research", "labor", "visit", "speech", "team"]),
  weather: z.string().optional(),
  mood: z.string().optional(),
  bgm: z.object({ title: z.string().min(1), url: z.string().min(1) }).optional(),
  photos: z.array(photoSchema),
  memberIds: z.array(uuidSchema),
  dayOrder: z.number().int().nonnegative(),
});

const phaseSchema = z.object({
  id: uuidSchema,
  title: z.string().min(1),
  color: z.string().min(1),
  order: z.number().int().nonnegative(),
});

const memberSchema = z.object({
  id: uuidSchema,
  name: z.string().min(1),
  avatarAssetId: uuidSchema.optional(),
  highlights: z.array(z.string()),
});

const futureLetterSchema = z.object({
  unlockAt: z.string().refine(isOffsetDateTime, "must be an ISO 8601 date-time with an explicit offset"),
  message: z.string().min(1),
  audioAssetId: uuidSchema.optional(),
});

const projectSchema = z.object({
  schemaVersion: z.literal(1),
  title: z.string().min(1),
  subtitle: z.string().min(1),
  heroTitle: z.string().min(1),
  heroDescription: z.string().min(1),
  startDate: dateSchema,
  endDate: dateSchema.optional(),
  timeZone: z.string().min(1),
  phases: z.array(phaseSchema),
  entries: z.array(entrySchema),
  members: z.array(memberSchema),
  assets: z.array(assetSchema),
  futureLetter: futureLetterSchema.optional(),
});

function isCalendarDate(value: string): boolean {
  if (!datePattern.test(value)) return false;
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
  return daysInMonth !== undefined && day >= 1 && day <= daysInMonth;
}

function isOffsetDateTime(value: string): boolean {
  const match = offsetDateTimePattern.exec(value);
  if (!match || !isCalendarDate(match[1]!)) return false;
  const hour = Number(match[2]);
  const minute = Number(match[3]);
  const second = Number(match[4]);
  const offsetHour = Number(match[5]);
  const offsetMinute = Number(match[6]);
  return hour <= 23 && minute <= 59 && second <= 59 && offsetHour <= 23 && offsetMinute <= 59;
}

function addIssue(context: z.RefinementCtx, path: (string | number)[], message: string): void {
  context.addIssue({ code: "custom", path, message });
}

function validateUniqueIds<T extends { id: string }>(
  values: T[], path: string,
  context: z.RefinementCtx,
): void {
  const seen = new Set<string>();
  values.forEach((value, index) => {
    if (seen.has(value.id)) addIssue(context, [path, index, "id"], `duplicate ${path} id`);
    seen.add(value.id);
  });
}

function validateAssetVariants(
  assets: PracticeAsset[],
  context: z.RefinementCtx,
  requirePaths: boolean,
): void {
  assets.forEach((asset, index) => {
    const expectedMimePrefix = asset.kind === "image" ? "image/" : "audio/";
    if (!baseMimeType(asset.mimeType).startsWith(expectedMimePrefix)) {
      addIssue(context, ["assets", index, "mimeType"], `${asset.kind} asset has an invalid MIME type`);
    }
    const required: Array<keyof PracticeAsset["variants"]> =
      asset.kind === "image" ? ["thumbnail", "display"] : ["audio"];
    required.forEach((variantName) => {
      const variant = asset.variants[variantName];
      if (!variant) {
        addIssue(context, ["assets", index, "variants", variantName], `${asset.kind} asset requires ${variantName} variant`);
      } else if (requirePaths && !isRelativePath(variant.path)) {
        addIssue(context, ["assets", index, "variants", variantName, "path"], "published asset variant requires a relative path");
      } else if (!baseMimeType(variant.mimeType).startsWith(expectedMimePrefix)) {
        addIssue(context, ["assets", index, "variants", variantName, "mimeType"], `${variantName} has an invalid MIME type`);
      }
    });
    if (asset.kind === "image" && asset.variants.audio) {
      addIssue(context, ["assets", index, "variants", "audio"], "image asset cannot define an audio variant");
    }
    if (asset.kind === "audio" && (asset.variants.thumbnail || asset.variants.display)) {
      addIssue(context, ["assets", index, "variants"], "audio asset cannot define image variants");
    }
  });
}

function baseMimeType(value: string): string {
  return value.split(";", 1)[0]!.trim().toLowerCase();
}

function validateReferences(project: PracticeProject, context: z.RefinementCtx): void {
  const phaseIds = new Set(project.phases.map((phase) => phase.id));
  const memberIds = new Set(project.members.map((member) => member.id));
  const assets = new Map(project.assets.map((asset) => [asset.id, asset]));

  validateUniqueIds(project.phases, "phases", context);
  validateUniqueIds(project.entries, "entries", context);
  validateUniqueIds(project.members, "members", context);
  validateUniqueIds(project.assets, "assets", context);

  project.entries.forEach((entry, entryIndex) => {
    if (!phaseIds.has(entry.phaseId)) addIssue(context, ["entries", entryIndex, "phaseId"], "entry references an unknown phase");
    entry.memberIds.forEach((memberId, memberIndex) => {
      if (!memberIds.has(memberId)) addIssue(context, ["entries", entryIndex, "memberIds", memberIndex], "entry references an unknown member");
    });
    validateUniqueIds(entry.photos, `entries.${entryIndex}.photos`, context);
    entry.photos.forEach((photo, photoIndex) => {
      const asset = assets.get(photo.assetId);
      if (!asset) addIssue(context, ["entries", entryIndex, "photos", photoIndex, "assetId"], "photo references an unknown asset");
      else if (asset.kind !== "image") addIssue(context, ["entries", entryIndex, "photos", photoIndex, "assetId"], "photo must reference an image asset");
    });
  });

  project.members.forEach((member, memberIndex) => {
    if (member.avatarAssetId) {
      const asset = assets.get(member.avatarAssetId);
      if (!asset) addIssue(context, ["members", memberIndex, "avatarAssetId"], "member references an unknown asset");
      else if (asset.kind !== "image") addIssue(context, ["members", memberIndex, "avatarAssetId"], "member avatar must reference an image asset");
    }
  });

  if (project.futureLetter?.audioAssetId) {
    const asset = assets.get(project.futureLetter.audioAssetId);
    if (!asset) addIssue(context, ["futureLetter", "audioAssetId"], "future letter references an unknown asset");
    else if (asset.kind !== "audio") addIssue(context, ["futureLetter", "audioAssetId"], "future letter audio must reference an audio asset");
  }
}

function validateDayOrder(project: PracticeProject, context: z.RefinementCtx): void {
  const byDate = new Map<string, Array<{ entry: PracticeEntry; index: number }>>();
  project.entries.forEach((entry, index) => {
    const group = byDate.get(entry.date) ?? [];
    group.push({ entry, index });
    byDate.set(entry.date, group);
  });
  byDate.forEach((group) => {
    const sorted = [...group].sort((a, b) => a.entry.dayOrder - b.entry.dayOrder || a.entry.id.localeCompare(b.entry.id));
    const seen = new Set<number>();
    sorted.forEach(({ entry, index }, expectedOrder) => {
      if (seen.has(entry.dayOrder)) addIssue(context, ["entries", index, "dayOrder"], "same-date dayOrder must be unique");
      seen.add(entry.dayOrder);
      if (entry.dayOrder !== expectedOrder) addIssue(context, ["entries", index, "dayOrder"], "same-date dayOrder must be contiguous from zero");
    });
  });
}

function validatePhaseContinuity(project: PracticeProject, context: z.RefinementCtx): void {
  const phaseOrders = new Map(project.phases.map((phase) => [phase.id, phase.order]));
  const orderedEntries = [...project.entries].sort(
    (a, b) => a.date.localeCompare(b.date) || a.dayOrder - b.dayOrder || a.id.localeCompare(b.id),
  );
  let previousOrder = -Infinity;
  orderedEntries.forEach((entry, index) => {
    const phaseOrder = phaseOrders.get(entry.phaseId);
    if (phaseOrder === undefined) return;
    if (phaseOrder < previousOrder) addIssue(context, ["entries", index, "phaseId"], "phase order cannot decrease along the road");
    previousOrder = phaseOrder;
  });
}

function isRelativePath(value: string | undefined): value is string {
  if (!value) return false;
  let candidate = value;
  while (true) {
    if (!isSafeRelativePath(candidate)) return false;
    let decoded: string;
    try {
      decoded = decodeURIComponent(candidate);
    } catch {
      return false;
    }
    if (decoded === candidate) return true;
    candidate = decoded;
  }
}

function isSafeRelativePath(value: string): boolean {
  if (value.startsWith("/") || value.startsWith("\\")) return false;
  if (/^[A-Za-z]:/.test(value) || /^[a-z][a-z\d+.-]*:/i.test(value)) return false;
  if ([...value].some((character) => {
    const code = character.charCodeAt(0);
    return code < 0x20 || code === 0x7f;
  })) return false;
  return !value.split(/[\\/]/).some((segment) => segment === ".." || segment === "");
}

export const draftProjectSchema = projectSchema.superRefine((project, context) => {
  validateReferences(project, context);
  validateAssetVariants(project.assets, context, false);
  validateDayOrder(project, context);
  validatePhaseContinuity(project, context);
});

export const publishedProjectSchema = projectSchema.superRefine((project, context) => {
  validateReferences(project, context);
  validateAssetVariants(project.assets, context, true);
  validateDayOrder(project, context);
  validatePhaseContinuity(project, context);
});

export type DraftPracticeProject = z.infer<typeof draftProjectSchema>;
export type PublishedPracticeProject = z.infer<typeof publishedProjectSchema>;
