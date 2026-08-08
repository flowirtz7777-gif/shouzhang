import type { PracticeEntry } from "./practice";

export function orderEntries(entries: PracticeEntry[]): PracticeEntry[] {
  return [...entries].sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      a.dayOrder - b.dayOrder ||
      a.id.localeCompare(b.id),
  );
}

export function normalizeEntryOrder(entries: PracticeEntry[]): PracticeEntry[] {
  const byDate = new Map<string, PracticeEntry[]>();
  for (const entry of orderEntries(entries)) {
    const group = byDate.get(entry.date) ?? [];
    group.push(entry);
    byDate.set(entry.date, group);
  }

  return [...byDate.values()].flatMap((group) =>
    group.map((entry, dayOrder) => ({ ...entry, dayOrder })),
  );
}
