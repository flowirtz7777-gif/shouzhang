import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { AppShell } from "./AppShell";

test("switches between road and journal", async () => {
  render(
    <AppShell editorEnabled onEdit={() => undefined}><div>页面内容</div></AppShell>,
    { wrapper: MemoryRouter },
  );
  const journalLink = screen.getByRole("link", { name: "翻页手账" });
  await userEvent.click(journalLink);
  expect(journalLink).toHaveAttribute("href", "/journal");
});

test("opens the editor from an accessible pencil button", async () => {
  const onEdit = vi.fn();
  render(
    <AppShell editorEnabled onEdit={onEdit}><div /></AppShell>,
    { wrapper: MemoryRouter },
  );
  await userEvent.click(screen.getByRole("button", { name: "编辑内容" }));
  expect(onEdit).toHaveBeenCalledOnce();
});
