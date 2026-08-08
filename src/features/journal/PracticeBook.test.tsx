import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { seedProject } from "../../domain/seedProject";
import { isFutureLetterUnlocked } from "./buildJournalPages";
import { PracticeBook } from "./PracticeBook";

test("uses simple pagination when reduced motion is enabled", async () => {
  render(<PracticeBook project={seedProject} initialEntryId={seedProject.entries[0]!.id} reducedMotion />);
  expect(screen.getByRole("article", { name: seedProject.entries[0]!.title })).toBeVisible();
  await userEvent.click(screen.getByRole("button", { name: "下一页" }));
  expect(screen.getByText("今日照片")).toBeVisible();
});

test("does not autoplay BGM", () => {
  render(<PracticeBook project={seedProject} reducedMotion />);
  expect(screen.getByRole("button", { name: /播放今日 BGM/ })).toHaveAttribute("aria-pressed", "false");
  expect(document.querySelector("audio[autoplay]")).not.toBeInTheDocument();
});

test.each([
  "https://163cn.tv/ba1BUvLu",
  "http://music.baidu.com/song/266069",
])("opens a music-platform BGM link instead of treating it as audio: %s", (url) => {
  const project = structuredClone(seedProject);
  const entry = project.entries[0]!;
  entry.bgm = { title: "旅途音乐", url };

  render(<PracticeBook project={project} initialEntryId={entry.id} reducedMotion />);

  const link = screen.getByRole("link", { name: "在音乐平台打开今日 BGM：旅途音乐" });
  expect(link).toHaveAttribute("href", url);
  expect(link).toHaveAttribute("target", "_blank");
  expect(document.querySelector("audio")).not.toBeInTheDocument();
});

test("keeps direct audio URLs playable inside the journal", () => {
  const project = structuredClone(seedProject);
  const entry = project.entries[0]!;
  entry.bgm = { title: "旅途音乐", url: "https://example.com/travel.mp3" };

  render(<PracticeBook project={project} initialEntryId={entry.id} reducedMotion />);

  expect(screen.getByRole("button", { name: "播放今日 BGM：旅途音乐" })).toBeEnabled();
  expect(document.querySelector("audio")).toHaveAttribute("src", "https://example.com/travel.mp3");
});

test("checks the future-letter unlock time with exact timestamps", () => {
  expect(isFutureLetterUnlocked("2027-07-12T09:00:00+08:00", "2027-07-12T08:59:59+08:00")).toBe(false);
  expect(isFutureLetterUnlocked("2027-07-12T09:00:00+08:00", "2027-07-12T09:00:00+08:00")).toBe(true);
});

test("shows the non-confidential notice while a future letter is locked", async () => {
  render(<PracticeBook project={seedProject} reducedMotion now="2026-07-12T09:00:00+08:00" />);
  await userEvent.click(screen.getByRole("button", { name: /未来信/ }));
  expect(screen.getByText("纪念性封存，不提供保密性")).toBeVisible();
});

test("turns a long diary body onto continuation pages before photos", async () => {
  const project = structuredClone(seedProject);
  const entry = project.entries[0]!;
  entry.body = "这一页写满后，实践故事会自然延续到下一张纸。".repeat(70);

  render(<PracticeBook project={project} initialEntryId={entry.id} reducedMotion />);
  await userEvent.click(screen.getByRole("button", { name: "下一页" }));

  expect(screen.getByRole("article", { name: new RegExp(`${entry.title}，正文 1`) })).toBeVisible();
  expect(screen.queryByText("今日照片")).not.toBeInTheDocument();
});

test("turns additional members onto the next member page", async () => {
  const project = structuredClone(seedProject);
  project.members = Array.from({ length: 5 }, (_, index) => ({
    id: `member-${index + 1}`,
    name: `成员${index + 1}`,
    highlights: [`高光${index + 1}`],
  }));

  render(<PracticeBook project={project} reducedMotion />);
  await userEvent.click(screen.getByRole("button", { name: "成员墙" }));

  expect(screen.getByRole("article", { name: "成员高光，第 1 / 2 页" })).toBeVisible();
  expect(screen.queryByText("成员5")).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "下一页" }));
  expect(screen.getByRole("article", { name: "成员高光，第 2 / 2 页" })).toBeVisible();
  expect(screen.getByText("成员5")).toBeVisible();
});

test("opens a journal photo at full size and restores focus on close", async () => {
  render(<PracticeBook project={seedProject} initialEntryId={seedProject.entries[0]!.id} reducedMotion />);
  await userEvent.click(screen.getByRole("button", { name: "下一页" }));
  const trigger = screen.getByRole("button", { name: /放大查看/ });

  await userEvent.click(trigger);
  expect(screen.getByRole("dialog", { name: /查看照片/ })).toBeVisible();
  const closeButton = screen.getByRole("button", { name: "关闭照片预览" });
  expect(closeButton).toHaveFocus();
  expect(closeButton).toHaveClass("journal-lightbox__close");
  expect(closeButton.closest(".journal-lightbox__toolbar")).toBeInTheDocument();
  expect(closeButton.closest("figure")).toBeNull();
  await userEvent.keyboard("{Escape}");
  expect(screen.queryByRole("dialog", { name: /查看照片/ })).not.toBeInTheDocument();
  const readingArea = screen.getByLabelText("翻页手账阅读区");
  await waitFor(() => expect([trigger, readingArea]).toContain(document.activeElement));
});
