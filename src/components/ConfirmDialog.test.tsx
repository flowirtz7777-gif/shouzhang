import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConfirmDialog } from "./ConfirmDialog";

function Harness() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>清空草稿</button>
      <ConfirmDialog
        open={open}
        title="清空草稿"
        description="此操作无法撤销。"
        confirmLabel="确认清空"
        danger
        onConfirm={() => setOpen(false)}
        onCancel={() => setOpen(false)}
      />
    </>
  );
}

test("focuses cancel, traps focus, closes on Escape, and restores the trigger", async () => {
  const user = userEvent.setup();
  render(<Harness />);
  const trigger = screen.getByRole("button", { name: "清空草稿" });

  await user.click(trigger);
  expect(screen.getByRole("button", { name: "取消" })).toHaveFocus();

  await user.keyboard("{Shift>}{Tab}{/Shift}");
  expect(screen.getByRole("button", { name: "确认清空" })).toHaveFocus();
  await user.keyboard("{Tab}");
  expect(screen.getByRole("button", { name: "取消" })).toHaveFocus();

  await user.keyboard("{Escape}");
  expect(screen.queryByRole("dialog", { name: "清空草稿" })).not.toBeInTheDocument();
  expect(trigger).toHaveFocus();
});
