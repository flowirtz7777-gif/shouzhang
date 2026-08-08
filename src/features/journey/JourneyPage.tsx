import { Bookmark, CalendarRange, Camera, MapPinned } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useSearchParams } from "react-router-dom";
import { resolveAssetUrl, revokeResolvedAssetUrl } from "../../data/assetResolver";
import { orderEntries } from "../../domain/orderEntries";
import type { PracticeAsset, PracticePhase } from "../../domain/practice";
import { usePractice } from "../../app/PracticeContext";
import { RoadTimeline, type RoadTimelineHandle } from "./RoadTimeline";

function publicAssetPath(path?: string): string | undefined {
  if (!path) return undefined;
  if (/^(?:https?:|blob:|data:|\/)/.test(path)) return path;
  return `/content/${path.replace(/^\.\//, "")}`;
}

function projectDateRange(startDate: string, endDate?: string): string {
  const start = startDate.replaceAll("-", ".");
  const end = endDate?.replaceAll("-", ".");
  return end && end !== start ? `${start} - ${end}` : start;
}

function phaseSort(a: PracticePhase, b: PracticePhase): number {
  return a.order - b.order || a.id.localeCompare(b.id);
}

function findAssetPath(asset?: PracticeAsset): string | undefined {
  return publicAssetPath(asset?.variants.thumbnail?.path ?? asset?.variants.display?.path);
}

export function JourneyPage() {
  const [searchParams] = useSearchParams();
  const { activeProject, publishedProject, assets, previewDraft } = usePractice();
  const timelineRef = useRef<RoadTimelineHandle>(null);
  const [assetUrls, setAssetUrls] = useState<ReadonlyMap<string, string>>(new Map());

  const entries = useMemo(() => orderEntries(activeProject.entries), [activeProject.entries]);
  const phases = useMemo(() => [...activeProject.phases].sort(phaseSort), [activeProject.phases]);
  const dayCount = new Set(entries.map((entry) => entry.date)).size;
  const photoCount = entries.reduce((total, entry) => total + entry.photos.length, 0);
  const currentPhaseId = entries.at(-1)?.phaseId ?? phases[0]?.id;
  const currentPhase = phases.find((phase) => phase.id === currentPhaseId);

  useEffect(() => {
    let cancelled = false;
    const urlsToRevoke: string[] = [];

    void (async () => {
      const nextUrls = new Map<string, string>();
      const assetIds = new Set(
        entries.flatMap((entry) => entry.photos.map((photo) => photo.assetId)),
      );

      await Promise.all(
        [...assetIds].map(async (assetId) => {
          const activeAsset = activeProject.assets.find((asset) => asset.id === assetId);
          const publishedAsset = publishedProject.assets.find((asset) => asset.id === assetId);
          const url = await resolveAssetUrl({
            assetId,
            variant: "thumbnail",
            localBlob: (id, variant) => assets.get(id, variant),
            publishedPath: findAssetPath(activeAsset) ?? findAssetPath(publishedAsset),
          });
          urlsToRevoke.push(url);
          nextUrls.set(`${assetId}:thumbnail`, url);
        }),
      );

      if (!cancelled) setAssetUrls(nextUrls);
    })();

    return () => {
      cancelled = true;
      urlsToRevoke.forEach(revokeResolvedAssetUrl);
    };
  }, [activeProject.assets, assets, entries, publishedProject.assets]);

  const overview = [
    { label: "实践日程", value: `${dayCount} 天`, icon: CalendarRange },
    { label: "活动站点", value: `${entries.length} 站`, icon: MapPinned },
    { label: "影像记录", value: `${photoCount} 张`, icon: Camera },
    { label: "当前章节", value: currentPhase?.title ?? "待出发", icon: Bookmark },
  ];

  return (
    <main className="journey-page">
      <section className="journey-intro" aria-labelledby="journey-title">
        <div className="journey-intro__copy">
          <span className="journey-kicker">
            {previewDraft ? "本地草稿预览" : "社会实践行程"}
          </span>
          <h1 id="journey-title">{activeProject.heroTitle}</h1>
          <p>{activeProject.heroDescription}</p>
          <div className="journey-meta">
            <strong>{activeProject.title}</strong>
            <span>{activeProject.subtitle}</span>
            <time>{projectDateRange(activeProject.startDate, activeProject.endDate)}</time>
          </div>
        </div>

        <dl className="journey-overview" aria-label="实践概览">
          {overview.map(({ label, value, icon: Icon }) => (
            <div key={label}>
              <dt>
                <Icon aria-hidden="true" size={17} />
                {label}
              </dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <nav className="phase-shortcuts" aria-label="实践章节快捷导航">
        <span>时光章节</span>
        {phases.map((phase) => (
          <button
            key={phase.id}
            type="button"
            className="phase-shortcut"
            style={{ "--phase-color": phase.color } as CSSProperties}
            onClick={() => timelineRef.current?.scrollToPhase(phase.id)}
          >
            <span aria-hidden="true" />
            {phase.title}
          </button>
        ))}
      </nav>

      <RoadTimeline
        ref={timelineRef}
        project={activeProject}
        assetUrls={assetUrls}
        initialEntryId={searchParams.get("entry") ?? undefined}
      />
    </main>
  );
}
