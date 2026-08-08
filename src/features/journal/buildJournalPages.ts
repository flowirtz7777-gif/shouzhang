import { orderEntries } from "../../domain/orderEntries";
import type { PracticeProject } from "../../domain/practice";

const COMPLETE_ENTRY_TEXT_UNITS = 190;
const BODY_PAGE_TEXT_UNITS = 500;
const MEMBERS_PER_PAGE = 4;

export type JournalLeaf =
  | { type: "chapter"; id: string; phaseId: string; title: string; side: "cover" | "index" }
  | {
      type: "entry-text";
      id: string;
      entryId: string;
      body: string;
      variant: "complete" | "overview" | "body";
      pageIndex: number;
      pageCount: number;
      bodyPageIndex: number;
      bodyPageCount: number;
    }
  | { type: "entry-photos"; id: string; entryId: string }
  | {
      type: "members";
      id: string;
      memberIds: string[];
      pageIndex: number;
      pageCount: number;
    }
  | { type: "future-letter"; id: "future-letter" };

export interface JournalPageModel {
  pages: JournalLeaf[];
  entryPageIndex: Map<string, number>;
}

export function isFutureLetterUnlocked(unlockAt: string, now: string): boolean {
  return Date.parse(now) >= Date.parse(unlockAt);
}

function visualUnits(character: string): number {
  if (character === "\n") return 30;
  return character.codePointAt(0)! <= 0xff ? 0.55 : 1;
}

function textVisualUnits(value: string): number {
  let previousHorizontalWhitespace = false;
  return Array.from(value).reduce((total, character) => {
    if (character === "\n") {
      previousHorizontalWhitespace = false;
      return total + visualUnits(character);
    }
    if (/[^\S\r\n]/u.test(character)) {
      if (previousHorizontalWhitespace) return total;
      previousHorizontalWhitespace = true;
      return total + 0.35;
    }
    previousHorizontalWhitespace = false;
    return total + visualUnits(character);
  }, 0);
}

function splitTextPage(value: string, limit: number): [string, string] {
  const characters = Array.from(value);
  let units = 0;
  let lastSentenceBreak = -1;
  let lastClauseBreak = -1;
  let lastWordBreak = -1;
  let fittedCount = 0;
  let previousHorizontalWhitespace = false;

  for (let index = 0; index < characters.length; index += 1) {
    const character = characters[index]!;
    const horizontalWhitespace = /[^\S\r\n]/u.test(character);
    const characterUnits = horizontalWhitespace
      ? previousHorizontalWhitespace ? 0 : 0.35
      : visualUnits(character);
    const nextUnits = units + characterUnits;
    if (nextUnits > limit && index > 0) break;
    units = nextUnits;
    fittedCount = index + 1;
    previousHorizontalWhitespace = horizontalWhitespace;
    if (character === "\n") previousHorizontalWhitespace = false;
    if (/[。！？；.!?;]/u.test(character)) lastSentenceBreak = fittedCount;
    if (/[，；：、,;:]/u.test(character)) lastClauseBreak = fittedCount;
    if (/\s/u.test(character)) lastWordBreak = fittedCount;
  }

  if (fittedCount >= characters.length) return [value.trim(), ""];
  const splitAt = Math.max(
    1,
    lastSentenceBreak >= Math.floor(fittedCount * 0.96)
      ? lastSentenceBreak
      : lastClauseBreak >= Math.floor(fittedCount * 0.97)
        ? lastClauseBreak
        : lastWordBreak >= Math.floor(fittedCount * 0.98)
          ? lastWordBreak
          : fittedCount,
  );
  return [
    characters.slice(0, splitAt).join("").trim(),
    characters.slice(splitAt).join("").trim(),
  ];
}

export function paginateEntryBody(body: string): string[] {
  const normalized = body.replace(/\r\n?/g, "\n").trim();
  if (!normalized) return [""];
  if (textVisualUnits(normalized) <= COMPLETE_ENTRY_TEXT_UNITS) return [normalized];

  const pages: string[] = [];
  let remaining = normalized;
  while (textVisualUnits(remaining) > BODY_PAGE_TEXT_UNITS) {
    const [page, rest] = splitTextPage(remaining, BODY_PAGE_TEXT_UNITS);
    pages.push(page);
    remaining = rest;
  }
  if (remaining) pages.push(remaining);

  return pages.length > 0 ? pages : [""];
}

function chunkMemberIds(memberIds: string[]): string[][] {
  if (memberIds.length === 0) return [[]];
  return Array.from(
    { length: Math.ceil(memberIds.length / MEMBERS_PER_PAGE) },
    (_, index) => memberIds.slice(index * MEMBERS_PER_PAGE, (index + 1) * MEMBERS_PER_PAGE),
  );
}

export function buildJournalPages(project: PracticeProject): JournalPageModel {
  const pages: JournalLeaf[] = [];
  const entryPageIndex = new Map<string, number>();
  const phases = [...project.phases].sort(
    (left, right) => left.order - right.order || left.id.localeCompare(right.id),
  );

  for (const phase of phases) {
    pages.push({
      type: "chapter",
      id: `chapter:${phase.id}:cover`,
      phaseId: phase.id,
      title: phase.title,
      side: "cover",
    });
    pages.push({
      type: "chapter",
      id: `chapter:${phase.id}:index`,
      phaseId: phase.id,
      title: phase.title,
      side: "index",
    });

    const entries = orderEntries(project.entries.filter((entry) => entry.phaseId === phase.id));
    for (const entry of entries) {
      entryPageIndex.set(entry.id, pages.length);
      const bodyPages = paginateEntryBody(entry.body);
      const requiresBodyPages = textVisualUnits(entry.body.replace(/\r\n?/g, "\n").trim())
        > COMPLETE_ENTRY_TEXT_UNITS;

      if (requiresBodyPages) {
        pages.push({
          type: "entry-text",
          id: `entry:${entry.id}:text`,
          entryId: entry.id,
          body: "",
          variant: "overview",
          pageIndex: 0,
          pageCount: bodyPages.length + 1,
          bodyPageIndex: -1,
          bodyPageCount: bodyPages.length,
        });
        bodyPages.forEach((body, bodyPageIndex) => {
          pages.push({
            type: "entry-text",
            id: `entry:${entry.id}:text:body:${bodyPageIndex + 1}`,
            entryId: entry.id,
            body,
            variant: "body",
            pageIndex: bodyPageIndex + 1,
            pageCount: bodyPages.length + 1,
            bodyPageIndex,
            bodyPageCount: bodyPages.length,
          });
        });
      } else {
        pages.push({
          type: "entry-text",
          id: `entry:${entry.id}:text`,
          entryId: entry.id,
          body: bodyPages[0] ?? "",
          variant: "complete",
          pageIndex: 0,
          pageCount: 1,
          bodyPageIndex: 0,
          bodyPageCount: 1,
        });
      }
      pages.push({ type: "entry-photos", id: `entry:${entry.id}:photos`, entryId: entry.id });
    }
  }

  const memberPages = chunkMemberIds(project.members.map((member) => member.id));
  memberPages.forEach((memberIds, pageIndex) => {
    pages.push({
      type: "members",
      id: pageIndex === 0 ? "members" : `members:${pageIndex + 1}`,
      memberIds,
      pageIndex,
      pageCount: memberPages.length,
    });
  });
  pages.push({ type: "future-letter", id: "future-letter" });

  return { pages, entryPageIndex };
}
