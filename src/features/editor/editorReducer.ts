import type {
  FutureLetter,
  PracticeEntry,
  PracticeMember,
  PracticePhase,
  PracticeProject,
  ProjectMetadata,
} from "../../domain/practice";
import { normalizeEntryOrder } from "../../domain/orderEntries";
import { draftProjectSchema } from "../../domain/practiceSchema";

export type EditorAction =
  | { type: "project/update"; patch: Partial<ProjectMetadata> }
  | { type: "phase/add"; phase: PracticePhase }
  | { type: "phase/update"; phaseId: string; patch: Partial<PracticePhase> }
  | { type: "phase/delete"; phaseId: string }
  | { type: "entry/upsert"; entry: PracticeEntry }
  | { type: "entry/delete"; entryId: string }
  | { type: "member/upsert"; member: PracticeMember }
  | { type: "member/delete"; memberId: string }
  | { type: "future-letter/update"; futureLetter?: FutureLetter }
  | { type: "project/replace"; project: PracticeProject };

function validateCandidate(
  current: PracticeProject,
  candidate: PracticeProject,
): PracticeProject {
  const result = draftProjectSchema.safeParse({
    ...candidate,
    entries: normalizeEntryOrder(candidate.entries),
  });
  return result.success ? result.data : current;
}

function upsertById<T extends { id: string }>(values: T[], value: T): T[] {
  const index = values.findIndex((candidate) => candidate.id === value.id);
  if (index < 0) return [...values, value];
  return values.map((candidate, candidateIndex) =>
    candidateIndex === index ? value : candidate,
  );
}

export function editorReducer(
  project: PracticeProject,
  action: EditorAction,
): PracticeProject {
  switch (action.type) {
    case "project/update":
      return validateCandidate(project, { ...project, ...action.patch });

    case "phase/add":
      return validateCandidate(project, {
        ...project,
        phases: [...project.phases, action.phase],
      });

    case "phase/update": {
      if (!project.phases.some((phase) => phase.id === action.phaseId)) return project;
      return validateCandidate(project, {
        ...project,
        phases: project.phases.map((phase) =>
          phase.id === action.phaseId ? { ...phase, ...action.patch, id: phase.id } : phase,
        ),
      });
    }

    case "phase/delete":
      if (
        !project.phases.some((phase) => phase.id === action.phaseId) ||
        project.entries.some((entry) => entry.phaseId === action.phaseId)
      ) {
        return project;
      }
      return validateCandidate(project, {
        ...project,
        phases: project.phases.filter((phase) => phase.id !== action.phaseId),
      });

    case "entry/upsert":
      return validateCandidate(project, {
        ...project,
        entries: upsertById(project.entries, action.entry),
      });

    case "entry/delete":
      if (!project.entries.some((entry) => entry.id === action.entryId)) return project;
      return validateCandidate(project, {
        ...project,
        entries: project.entries.filter((entry) => entry.id !== action.entryId),
      });

    case "member/upsert":
      return validateCandidate(project, {
        ...project,
        members: upsertById(project.members, action.member),
      });

    case "member/delete":
      if (!project.members.some((member) => member.id === action.memberId)) return project;
      return validateCandidate(project, {
        ...project,
        members: project.members.filter((member) => member.id !== action.memberId),
        entries: project.entries.map((entry) => ({
          ...entry,
          memberIds: entry.memberIds.filter((memberId) => memberId !== action.memberId),
        })),
      });

    case "future-letter/update":
      return validateCandidate(project, {
        ...project,
        futureLetter: action.futureLetter,
      });

    case "project/replace":
      return validateCandidate(project, action.project);
  }
}

export function collectReferencedAssetIds(project: PracticeProject): Set<string> {
  const referenced = new Set<string>();
  for (const entry of project.entries) {
    for (const photo of entry.photos) referenced.add(photo.assetId);
  }
  for (const member of project.members) {
    if (member.avatarAssetId) referenced.add(member.avatarAssetId);
  }
  if (project.futureLetter?.audioAssetId) {
    referenced.add(project.futureLetter.audioAssetId);
  }
  return referenced;
}

export function isAssetUnreferenced(
  project: PracticeProject,
  assetId: string,
): boolean {
  return !collectReferencedAssetIds(project).has(assetId);
}
