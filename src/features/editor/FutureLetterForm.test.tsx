import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { FutureLetterForm } from "./FutureLetterForm";

test("shows the privacy boundary and maps microphone denial", async () => {
  render(
    <FutureLetterForm
      value={{ unlockAt: "2027-07-12T09:00:00+08:00", message: "未来见" }}
      onChange={vi.fn()}
      requestRecording={async () => {
        throw new DOMException("Denied", "NotAllowedError");
      }}
    />,
  );
  expect(screen.getByText(/并不保密/)).toBeVisible();
  await userEvent.click(screen.getByRole("button", { name: "开始录音" }));
  expect(screen.getByText("无法使用麦克风，请检查浏览器权限")).toBeVisible();
});

test("saves an unlock time with an explicit offset", async () => {
  const onChange = vi.fn();
  render(
    <FutureLetterForm
      value={{ unlockAt: "2027-07-12T09:00:00+08:00", message: "未来见" }}
      onChange={onChange}
      requestRecording={vi.fn()}
    />,
  );
  await userEvent.clear(screen.getByLabelText("解锁日期与时间"));
  await userEvent.type(screen.getByLabelText("解锁日期与时间"), "2028-07-12T09:00");
  await userEvent.selectOptions(screen.getByLabelText("时区偏移"), "+08:00");
  expect(onChange).toHaveBeenLastCalledWith(
    expect.objectContaining({ unlockAt: "2028-07-12T09:00:00+08:00" }),
  );
});
