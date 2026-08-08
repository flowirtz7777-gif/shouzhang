import { draftProjectSchema, publishedProjectSchema } from "./practiceSchema";
import { seedProject } from "./seedProject";
import practiceJson from "../../public/content/practice.json";

test("accepts the valid seed project as a draft", () => {
  expect(draftProjectSchema.parse(seedProject)).toEqual(seedProject);
});

test("keeps the seed project equal to the published JSON", () => {
  expect(practiceJson).toEqual(seedProject);
});

test("rejects a photo that references audio", () => {
  const project = structuredClone(seedProject);
  project.assets[0]!.kind = "audio";
  expect(() => draftProjectSchema.parse(project)).toThrow(/image/i);
});

test("published data requires asset paths", () => {
  const project = structuredClone(seedProject);
  delete project.assets[0]!.variants.display!.path;
  expect(() => publishedProjectSchema.parse(project)).toThrow(/path/i);
});

test.each([
  "/assets/x.webp",
  "\\assets\\x.webp",
  "C:\\assets\\x.webp",
  "https://example.com/x.webp",
  "assets/../x.webp",
  "assets\\..\\x.webp",
  "assets/%2e%2e/x.webp",
  "assets/%252e%252e/x.webp",
  "assets//x.webp",
  "assets\\\\x.webp",
  "assets/%zz/x.webp",
])("published data rejects an unsafe asset path: %s", (path) => {
  const project = structuredClone(seedProject);
  project.assets[0]!.variants.display!.path = path;
  expect(() => publishedProjectSchema.parse(project)).toThrow(/path/i);
});

test.each([
  "2027-04-31T09:00:00+08:00",
  "2027-07-12T24:00:00+08:00",
  "2027-07-12T09:60:00+08:00",
  "2027-07-12T09:00:60+08:00",
  "2027-07-12T09:00:00+24:00",
  "2027-07-12T09:00:00+08:60",
])("rejects an invalid unlock time: %s", (unlockAt) => {
  const project = structuredClone(seedProject);
  project.futureLetter!.unlockAt = unlockAt;
  expect(() => draftProjectSchema.parse(project)).toThrow(/date-time|calendar|valid/i);
});

test("rejects a non-UUID entity ID", () => {
  const project = structuredClone(seedProject);
  project.entries[0]!.id = "entry-not-a-uuid";
  expect(() => draftProjectSchema.parse(project)).toThrow(/uuid/i);
});

test("rejects a non-UUID reference ID", () => {
  const project = structuredClone(seedProject);
  project.entries[0]!.phaseId = "phase-not-a-uuid";
  expect(() => draftProjectSchema.parse(project)).toThrow(/uuid/i);
});
