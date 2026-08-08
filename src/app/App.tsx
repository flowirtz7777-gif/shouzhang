import { useCallback, useEffect, useMemo, useState } from "react";
import { ToastRegion } from "../components/ToastRegion";
import { DraftRepository } from "../data/draftRepository";
import { PublishedRepository } from "../data/publishedRepository";
import type { PracticeProject } from "../domain/practice";
import { draftProjectSchema } from "../domain/practiceSchema";
import { AppRouter } from "./AppRouter";
import { PracticeContext, type PracticeContextValue } from "./PracticeContext";

const publishedRepository = new PublishedRepository();
const draftRepository = new DraftRepository();
const PREVIEW_PREFERENCE_KEY = "social-practice-preview-mode";

export function App() {
  const [publishedProject, setPublishedProject] = useState<PracticeProject>();
  const [draftProject, setDraftProject] = useState<PracticeProject>();
  const [previewDraft, setPreviewDraft] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [retryKey, setRetryKey] = useState(0);
  const [messages, setMessages] = useState<string[]>([]);

  const announce = useCallback((message: string) => {
    setMessages([message]);
    window.setTimeout(() => setMessages([]), 2800);
  }, []);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const published = await publishedRepository.load();
        if (!published) throw new Error("未找到已发布的实践内容");
        const draft = await draftRepository.load();
        if (cancelled) return;
        setPublishedProject(published);
        setDraftProject(draft);
        setPreviewDraft(
          Boolean(draft) && window.localStorage.getItem(PREVIEW_PREFERENCE_KEY) !== "published",
        );
      } catch (reason) {
        if (cancelled) return;
        setError(reason instanceof Error ? reason.message : "内容载入失败");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [retryKey]);

  const retry = useCallback(() => {
    setLoading(true);
    setError(undefined);
    setRetryKey((value) => value + 1);
  }, []);

  const saveDraft = useCallback(async (project: PracticeProject) => {
    const parsed = draftProjectSchema.parse(project);
    setDraftProject(parsed);
    setPreviewDraft(true);
    window.localStorage.setItem(PREVIEW_PREFERENCE_KEY, "draft");
    await draftRepository.save(parsed);
  }, []);

  const updatePreviewDraft = useCallback((value: boolean) => {
    setPreviewDraft(value);
    window.localStorage.setItem(PREVIEW_PREFERENCE_KEY, value ? "draft" : "published");
  }, []);

  const replaceDraft = useCallback(async (project: PracticeProject, assets: Map<string, Blob>) => {
    await draftRepository.replace(project, assets);
    setDraftProject(project);
    setPreviewDraft(true);
    window.localStorage.setItem(PREVIEW_PREFERENCE_KEY, "draft");
  }, []);

  const clearDraft = useCallback(async () => {
    await draftRepository.clear();
    setDraftProject(undefined);
    setPreviewDraft(false);
    window.localStorage.removeItem(PREVIEW_PREFERENCE_KEY);
  }, []);

  const restorePublished = useCallback(async () => {
    if (!publishedProject) return;
    await draftRepository.clear();
    const restored = await draftRepository.loadOrClone(publishedProject);
    await draftRepository.copyPublishedAssets(restored);
    setDraftProject(restored);
    updatePreviewDraft(true);
    announce("已恢复到当前发布版本");
  }, [announce, publishedProject, updatePreviewDraft]);

  const openEditor = useCallback(async () => {
    if (!publishedProject) return;
    const draft = draftProject ?? (await draftRepository.loadOrClone(publishedProject));
    setDraftProject(draft);
    updatePreviewDraft(true);
    if (!draftProject) void draftRepository.copyPublishedAssets(publishedProject);
  }, [draftProject, publishedProject, updatePreviewDraft]);

  const contextValue = useMemo<PracticeContextValue | undefined>(() => {
    if (!publishedProject) return undefined;
    return {
      publishedProject,
      draftProject,
      activeProject: previewDraft && draftProject ? draftProject : publishedProject,
      previewDraft,
      assets: draftRepository,
      setPreviewDraft: updatePreviewDraft,
      saveDraft,
      replaceDraft,
      restorePublished,
      clearDraft,
    };
  }, [clearDraft, draftProject, previewDraft, publishedProject, replaceDraft, restorePublished, saveDraft, updatePreviewDraft]);

  if (loading) {
    return (
      <main className="app-state" aria-busy="true">
        <span className="app-state__stamp" aria-hidden="true">装订中</span>
        <h1>我们的实践手账</h1>
        <p>正在整理旅途内容...</p>
      </main>
    );
  }

  if (error || !contextValue) {
    return (
      <main className="app-state app-state--error">
        <span className="app-state__stamp" aria-hidden="true">暂未打开</span>
        <h1>实践手账载入失败</h1>
        <p>{error ?? "没有可显示的内容"}</p>
        <button type="button" className="button button--primary" onClick={retry}>
          重新载入
        </button>
      </main>
    );
  }

  return (
    <PracticeContext.Provider value={contextValue}>
      <AppRouter onEdit={() => void openEditor()} />
      <ToastRegion messages={messages} />
    </PracticeContext.Provider>
  );
}
