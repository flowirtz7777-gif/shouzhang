import { normalizeEntryOrder, orderEntries } from "./orderEntries";
import { seedProject } from "./seedProject";

test("orders the road by date, same-day order, then UUID", () => {
  const entries = [
    { ...seedProject.entries[0]!, id: "b", date: "2026-07-02", dayOrder: 0 },
    { ...seedProject.entries[0]!, id: "c", date: "2026-07-01", dayOrder: 1 },
    { ...seedProject.entries[0]!, id: "a", date: "2026-07-01", dayOrder: 1 },
  ];
  expect(orderEntries(entries).map((entry) => entry.id)).toEqual(["a", "c", "b"]);
});

test("normalizes duplicate same-day order values", () => {
  const entries = [
    { ...seedProject.entries[0]!, id: "b", dayOrder: 0 },
    { ...seedProject.entries[0]!, id: "a", dayOrder: 0 },
  ];
  expect(normalizeEntryOrder(entries).map(({ id, dayOrder }) => [id, dayOrder])).toEqual([
    ["a", 0],
    ["b", 1],
  ]);
});
