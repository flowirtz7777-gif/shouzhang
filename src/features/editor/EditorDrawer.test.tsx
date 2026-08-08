import { StrictMode, useState } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { deleteDB } from "idb";
import { beforeEach } from "vitest";
import { closePracticeDb, DATABASE_NAME } from "../../data/db";
import { seedProject } from "../../domain/seedProject";
import { EditorDrawer } from "./EditorDrawer";
import { createEntryBuffer, updateEntryBuffer } from "./editBuffer";
import { indexedDbDraftAutosaveStorage } from "./useDraftAutosave";

beforeEach(async () => {
  await closePracticeDb();
  await deleteDB(DATABASE_NAME);
});

function Harness() {
  const [open, setOpen] = useState(false);
  const [project, setProject] = useState(seedProject);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>编辑内容</button>
      <EditorDrawer
        open={open}
        project={project}
        onProjectChange={setProject}
        onClose={() => setOpen(false)}
      />
    </>
  );
}

function RevisionHarness() {
  const [project, setProject] = useState(seedProject);
  const [projectRevision, setProjectRevision] = useState(0);

  function replaceProject() {
    const replacement = structuredClone(seedProject);
    replacement.entries[0] = {
      ...replacement.entries[0]!,
      title: "替换项目中的活动标题",
    };
    setProject(replacement);
    setProjectRevision((value) => value + 1);
  }

  return (
    <>
      <button type="button" onClick={replaceProject}>替换项目</button>
      <EditorDrawer
        open
        project={project}
        projectRevision={projectRevision}
        onProjectChange={setProject}
        onClose={() => undefined}
      />
    </>
  );
}

test("moves focus into the drawer and restores it when closed", async () => {
  render(<Harness />);
  const trigger = screen.getByRole("button", { name: "编辑内容" });
  await userEvent.click(trigger);
  expect(screen.getByRole("dialog", { name: "内容编辑器" })).toContainElement(
    document.activeElement as HTMLElement,
  );
  await userEvent.keyboard("{Escape}");
  await waitFor(() => expect(trigger).toHaveFocus());
});

test("keeps keyboard focus inside the open drawer", async () => {
  render(<Harness />);
  await userEvent.click(screen.getByRole("button", { name: "编辑内容" }));
  const dialog = screen.getByRole("dialog", { name: "内容编辑器" });
  await userEvent.tab({ shift: true });
  expect(dialog).toContainElement(document.activeElement as HTMLElement);
});

test("rebuilds the activity form when a replacement project reuses the same entry id", async () => {
  render(<RevisionHarness />);
  await userEvent.click(screen.getByRole("tab", { name: "活动管理" }));
  expect(screen.getByLabelText("活动标题")).toHaveValue(seedProject.entries[0]!.title);

  await userEvent.click(screen.getByRole("button", { name: "替换项目" }));

  await waitFor(() => {
    expect(screen.getByLabelText("活动标题")).toHaveValue("替换项目中的活动标题");
  });
});

test("restores an incomplete local buffer under StrictMode", async () => {
  const buffer = updateEntryBuffer(createEntryBuffer({
    phaseId: seedProject.phases[0]!.id,
    date: seedProject.startDate,
  }), { title: "未完成的采访记录" });
  await indexedDbDraftAutosaveStorage.saveBuffer(buffer);

  render(
    <StrictMode>
      <EditorDrawer
        open
        project={seedProject}
        onProjectChange={() => undefined}
        onClose={() => undefined}
      />
    </StrictMode>,
  );
  await userEvent.click(screen.getByRole("tab", { name: "活动管理" }));

  await waitFor(() => {
    expect(screen.getByLabelText("活动标题")).toHaveValue("未完成的采访记录");
  });
});
