export type PracticeIcon = "research" | "labor" | "visit" | "speech" | "team";

export interface PracticeProject {
  schemaVersion: 1;
  title: string;
  subtitle: string;
  heroTitle: string;
  heroDescription: string;
  startDate: string;
  endDate?: string;
  timeZone: string;
  phases: PracticePhase[];
  entries: PracticeEntry[];
  members: PracticeMember[];
  assets: PracticeAsset[];
  futureLetter?: FutureLetter;
}

export interface PracticePhase {
  id: string;
  title: string;
  color: string;
  order: number;
}

export interface PracticeEntry {
  id: string;
  phaseId: string;
  date: string;
  title: string;
  summary: string;
  body: string;
  location?: string;
  icon: PracticeIcon;
  weather?: string;
  mood?: string;
  bgm?: {
    title: string;
    url: string;
  };
  photos: PracticePhoto[];
  memberIds: string[];
  dayOrder: number;
}

export interface PracticePhoto {
  id: string;
  assetId: string;
  alt: string;
  caption?: string;
  order: number;
}

export interface PracticeMember {
  id: string;
  name: string;
  avatarAssetId?: string;
  highlights: string[];
}

export interface PracticeAsset {
  id: string;
  kind: "image" | "audio";
  mimeType: string;
  originalName: string;
  width?: number;
  height?: number;
  durationSeconds?: number;
  variants: {
    thumbnail?: AssetVariant;
    display?: AssetVariant;
    audio?: AssetVariant;
  };
}

export interface AssetVariant {
  path?: string;
  byteSize: number;
  mimeType: string;
  width?: number;
  height?: number;
}

export interface FutureLetter {
  unlockAt: string;
  message: string;
  audioAssetId?: string;
}

export type ProjectMetadata = Pick<
  PracticeProject,
  "title" | "subtitle" | "heroTitle" | "heroDescription" | "startDate" | "endDate" | "timeZone"
>;

export type AssetVariantName = "thumbnail" | "display" | "audio";
