import { ArrowLeft, BookOpen } from "lucide-react";
import { useContext } from "react";
import { Link, useParams } from "react-router-dom";
import type { PracticeProject } from "../../domain/practice";
import { useReducedMotion } from "../../hooks/useReducedMotion";
import { PracticeContext } from "../../app/PracticeContext";
import { useReaderNavigation } from "../../app/readerNavigation";
import { PracticeBook } from "./PracticeBook";

export interface JournalPageProps {
  project?: PracticeProject;
  reducedMotion?: boolean;
}

function MotionAwareBook({ project, initialEntryId }: { project: PracticeProject; initialEntryId?: string | null }) {
  const reducedMotion = useReducedMotion();
  const practice = useContext(PracticeContext);
  return (
    <PracticeBook
      project={project}
      initialEntryId={initialEntryId}
      reducedMotion={reducedMotion}
      assets={practice?.assets}
    />
  );
}

export function JournalPage({ project: projectOverride, reducedMotion }: JournalPageProps) {
  const practice = useContext(PracticeContext);
  const navigation = useReaderNavigation();
  const project = projectOverride ?? practice?.activeProject;
  const { entryId } = useParams<{ entryId: string }>();

  if (!project) {
    return (
      <main className="journal-page journal-page--empty">
        <BookOpen size={38} aria-hidden="true" />
        <h1>手账暂时没有内容</h1>
      </main>
    );
  }

  const entryExists = entryId ? project.entries.some((entry) => entry.id === entryId) : false;
  const missingEntry = Boolean(entryId && !entryExists);
  const initialEntryId = entryExists ? entryId! : missingEntry ? null : undefined;
  const roadUrl = new URL(navigation.journeyPath, "https://reader.local");
  if (entryExists) roadUrl.searchParams.set("entry", entryId!);
  const roadTarget = `${roadUrl.pathname}${roadUrl.search}`;
  const canUseMotionHook = reducedMotion === undefined
    && typeof window !== "undefined"
    && typeof window.matchMedia === "function";

  return (
    <main className="journal-page">
      <div className="journal-page__topline">
        <Link className="journal-back-link" to={roadTarget}>
    <ArrowLeft size={18} aria-hidden="true" />返回铁路线路
        </Link>
        <div>
          <span>MEMORY BOOK</span>
          <h1>{project.title}</h1>
        </div>
        <p>{project.subtitle}</p>
      </div>

      {missingEntry ? (
        <div className="journal-route-notice" role="status">
          <strong>这段活动已经不存在</strong>
          <span>已经为你翻回手账目录，可以从其他章节继续阅读。</span>
        </div>
      ) : null}

      {canUseMotionHook ? (
        <MotionAwareBook project={project} initialEntryId={initialEntryId} />
      ) : (
        <PracticeBook
          project={project}
          initialEntryId={initialEntryId}
          reducedMotion={reducedMotion ?? true}
          assets={practice?.assets}
        />
      )}
    </main>
  );
}
