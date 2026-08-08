import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { seedProject } from "../../domain/seedProject";
import { JournalPage } from "./JournalPage";

test("falls back to the journal directory for an unknown entry", () => {
  render(
    <MemoryRouter initialEntries={["/journal/missing-entry"]}>
      <Routes>
        <Route path="/journal/:entryId" element={<JournalPage project={seedProject} />} />
      </Routes>
    </MemoryRouter>,
  );
  expect(screen.getByText("这段活动已经不存在")).toBeVisible();
  expect(screen.getByRole("heading", { name: "手账目录" })).toBeVisible();
});

test("opens a known activity at its diary page", () => {
  const entry = seedProject.entries[1]!;
  render(
    <MemoryRouter initialEntries={[`/journal/${entry.id}`]}>
      <Routes>
        <Route path="/journal/:entryId" element={<JournalPage project={seedProject} reducedMotion />} />
      </Routes>
    </MemoryRouter>,
  );
  expect(screen.getByRole("article", { name: entry.title })).toBeVisible();
    expect(screen.getByRole("link", { name: "返回铁路线路" })).toHaveAttribute(
    "href",
    `/journey?entry=${entry.id}`,
  );
});
