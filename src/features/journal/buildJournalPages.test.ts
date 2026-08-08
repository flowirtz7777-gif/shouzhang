import { seedProject } from "../../domain/seedProject";
import { buildJournalPages, paginateEntryBody } from "./buildJournalPages";

test("orders chapters, activities, member wall, then future letter", () => {
  const { pages } = buildJournalPages(seedProject);
  expect(pages[0]).toMatchObject({ type: "chapter", phaseId: seedProject.phases[0]!.id });
  expect(pages.findIndex((page) => page.type === "members")).toBeLessThan(
    pages.findIndex((page) => page.type === "future-letter"),
  );
});

test("maps every activity id to a journal page index", () => {
  const { entryPageIndex } = buildJournalPages(seedProject);
  for (const entry of seedProject.entries) {
    expect(entryPageIndex.get(entry.id)).toBeTypeOf("number");
  }
});

test("ships seven sample stations with one balanced long-form diary", () => {
  const longEntries = seedProject.entries.filter(
    (entry) => paginateEntryBody(entry.body).length > 1,
  );

  expect(seedProject.entries).toHaveLength(7);
  expect(new Set(seedProject.entries.map((entry) => entry.date)).size).toBe(5);
  expect(longEntries).toHaveLength(1);
  expect(longEntries[0]!.title).toBe("沿溪村落深度走访");
  expect(paginateEntryBody(longEntries[0]!.body)).toHaveLength(3);
});

test("keeps activities inside their ordered chapter", () => {
  const project = structuredClone(seedProject);
  project.phases.reverse();
  project.entries.reverse();

  const { pages } = buildJournalPages(project);
  const firstChapter = pages.findIndex((page) => page.type === "chapter");
  const firstEntry = pages.findIndex((page) => page.type === "entry-text");

  expect(pages[firstChapter]).toMatchObject({ phaseId: seedProject.phases[0]!.id });
  expect(pages[firstEntry]).toMatchObject({ entryId: seedProject.entries[0]!.id });
});

test("continues a long diary body across paper pages before its photo page", () => {
  const project = structuredClone(seedProject);
  const entry = project.entries[0]!;
  entry.body = "这是一段需要延续到下一页的实践记录。".repeat(80);

  const { pages, entryPageIndex } = buildJournalPages(project);
  const textPages = pages.filter(
    (page) => page.type === "entry-text" && page.entryId === entry.id,
  );
  const photoIndex = pages.findIndex(
    (page) => page.type === "entry-photos" && page.entryId === entry.id,
  );

  expect(textPages.length).toBeGreaterThan(1);
  expect(textPages[0]).toMatchObject({ type: "entry-text", variant: "overview", body: "" });
  expect(textPages.slice(1).every(
    (page) => page.type === "entry-text" && page.variant === "body",
  )).toBe(true);
  expect(textPages.map((page) => page.type === "entry-text" ? page.body : "").join(""))
    .toBe(entry.body);
  expect(entryPageIndex.get(entry.id)).toBe(pages.indexOf(textPages[0]!));
  expect(photoIndex).toBe(pages.indexOf(textPages.at(-1)!) + 1);
});

test("keeps short diary text on one page", () => {
  expect(paginateEntryBody(seedProject.entries[0]!.body)).toHaveLength(1);
});

test("fills remaining paper space with text from the next paragraph", () => {
  const firstParagraph = "第一段已经占用了一部分纸面。".repeat(12);
  const secondParagraph = "第二段包含很多完整句子，应当利用上一页剩余空间。".repeat(22);
  const pages = paginateEntryBody(`${firstParagraph}\n\n${secondParagraph}`);

  expect(pages.length).toBeGreaterThan(1);
  expect(pages[0]).toContain(firstParagraph);
  expect(pages[0]).toContain("第二段包含很多完整句子");
  expect(pages[0]).toMatch(/[。！？]$/u);
});

test("continues the member wall in groups of four", () => {
  const project = structuredClone(seedProject);
  project.members = Array.from({ length: 9 }, (_, index) => ({
    id: `member-${index + 1}`,
    name: `成员${index + 1}`,
    highlights: [`高光${index + 1}`],
  }));

  const { pages } = buildJournalPages(project);
  const memberPages = pages.filter((page) => page.type === "members");

  expect(memberPages).toHaveLength(3);
  expect(memberPages.map((page) => page.type === "members" ? page.memberIds.length : 0))
    .toEqual([4, 4, 1]);
  expect(memberPages.flatMap((page) => page.type === "members" ? page.memberIds : []))
    .toEqual(project.members.map((member) => member.id));
});
