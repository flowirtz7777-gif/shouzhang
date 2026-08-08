import { render, screen } from "@testing-library/react";
import { closePracticeDb } from "../data/db";
import { seedProject } from "../domain/seedProject";
import { App } from "./App";

afterEach(async () => {
  vi.restoreAllMocks();
  window.localStorage.clear();
  closePracticeDb();
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase("social-practice-record");
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => resolve();
  });
});

test("renders the platform identity", async () => {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(JSON.stringify(seedProject), { status: 200, headers: { "Content-Type": "application/json" } }),
  );
  render(<App />);
  expect(await screen.findByRole("banner")).toHaveTextContent("我们的实践手账");
});

test("offers a retry when published content cannot load", async () => {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("", { status: 500 }));
  render(<App />);
  expect(await screen.findByRole("heading", { name: "实践手账载入失败" })).toBeVisible();
  expect(screen.getByRole("button", { name: "重新载入" })).toBeEnabled();
});
