import {
  ChevronLeft,
  ChevronRight,
  Flag,
  Handshake,
  MapPin,
  Megaphone,
  Search,
  Shovel,
  Users,
  type LucideIcon,
} from "lucide-react";
import {
  forwardRef,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import { Link } from "react-router-dom";
import { IconButton } from "../../components/IconButton";
import { orderEntries } from "../../domain/orderEntries";
import { publicUrl } from "../../data/publicPaths";
import type {
  PracticeAsset,
  PracticeEntry,
  PracticeIcon,
  PracticePhase,
  PracticeProject,
} from "../../domain/practice";
import { useReducedMotion } from "../../hooks/useReducedMotion";
import { useReaderNavigation } from "../../app/readerNavigation";
import { buildRoadGeometry, getRoadPose, type RoadStation } from "./roadGeometry";
import "./journey.css";

const ROAD_HEIGHT = 690;
const CARD_WIDTH = 244;
const CARD_HEIGHT = 184;
const ROAD_HALF_WIDTH = 36;
// 负数表示轮底落在轨道中心线下方（压住钢轨），数值可微调。
const TRAIN_RAIL_OVERLAP = -30;
const TERMINAL_SIGN_HEIGHT = 34;
const FINISH_TERMINAL_POST_HEIGHT = 50;
const MAX_BUS_ANGLE = 16;
const ROAD_STEP_EPSILON = 0.0001;
const ROAD_SCROLL_BASE_DURATION_MS = 190;
const ROAD_SCROLL_PER_STATION_MS = 190;
const ROAD_SCROLL_MAX_DURATION_MS = 1450;
// 待替换：参考图到位后，把这里换成动车组侧视图与铁路背景素材。
const VEHICLE_URL = publicUrl("ui-assets/train-side.webp");
const FIELD_PANORAMA_URL = publicUrl("ui-assets/rail-bg.webp");
const ROAD_SCROLL_STORAGE_KEY = "social-practice-journey-scroll-left";

// 铁路视觉常量：双轨间距、接触网高度与立柱高度（viewBox 坐标）。
const TRACK_RAIL_OFFSET = 15;
const TRACK_CONTACT_OFFSET = 48;
const TRACK_MESSENGER_OFFSET = 64;
const TRACK_POLE_TOP_OFFSET = 92;
const TRACK_POLE_BOTTOM_OFFSET = 24;
const TRACK_ARM_SPAN = 34;

const entryIcons: Record<PracticeIcon, LucideIcon> = {
  research: Search,
  labor: Shovel,
  visit: Handshake,
  speech: Megaphone,
  team: Users,
};

export interface RoadTimelineHandle {
  scrollToPhase(phaseId: string): void;
}

export interface RoadTimelineProps {
  project: PracticeProject;
  assetUrls?: ReadonlyMap<string, string>;
  initialEntryId?: string;
}

interface PositionedEntry {
  entry: PracticeEntry;
  station: RoadStation;
  phase?: PracticePhase;
  cardLeft: number;
  cardTop: number;
  aboveRoad: boolean;
}

interface DragState {
  pointerId: number;
  startX: number;
  startScrollLeft: number;
}

interface AnimationFrameStore {
  current: number | undefined;
}

function formatDate(date: string): string {
  const [, month = "", day = ""] = date.split("-");
  return `${Number(month)}月${Number(day)}日`;
}

function publicAssetPath(path?: string): string | undefined {
  if (!path) return undefined;
  if (/^(?:https?:|blob:|data:|\/)/.test(path)) return path;
  return publicUrl(`content/${path.replace(/^\.\//, "")}`);
}

function entryThumbnail(
  entry: PracticeEntry,
  assetsById: ReadonlyMap<string, PracticeAsset>,
  assetUrls?: ReadonlyMap<string, string>,
): { src: string; alt: string } | undefined {
  const photo = [...entry.photos].sort((a, b) => a.order - b.order)[0];
  if (!photo) return undefined;

  const resolved = assetUrls?.get(`${photo.assetId}:thumbnail`);
  if (resolved) return { src: resolved, alt: photo.alt };

  const asset = assetsById.get(photo.assetId);
  const variant = asset?.variants.thumbnail ?? asset?.variants.display;
  const path = publicAssetPath(variant?.path);
  return path ? { src: path, alt: photo.alt } : undefined;
}

function cancelRoadScroll(frameStore: AnimationFrameStore): void {
  if (frameStore.current === undefined) return;
  window.cancelAnimationFrame(frameStore.current);
  frameStore.current = undefined;
}

function easeInOutCubic(progress: number): number {
  return progress < 0.5
    ? 4 * progress ** 3
    : 1 - (-2 * progress + 2) ** 3 / 2;
}

function scrollToLeft(
  element: HTMLDivElement,
  left: number,
  reducedMotion: boolean,
  stationCount: number,
  frameStore: AnimationFrameStore,
  onUpdate: () => void,
): void {
  cancelRoadScroll(frameStore);
  const maxScroll = Math.max(0, element.scrollWidth - element.clientWidth);
  const target = Math.min(maxScroll, Math.max(0, left));
  const start = element.scrollLeft;

  if (reducedMotion || start === target || typeof window.requestAnimationFrame !== "function") {
    element.scrollLeft = target;
    onUpdate();
    return;
  }

  const stationSpan = maxScroll / Math.max(1, stationCount - 1);
  const stationDistance = stationSpan > 0 ? Math.abs(target - start) / stationSpan : 1;
  const duration = Math.min(
    ROAD_SCROLL_MAX_DURATION_MS,
    ROAD_SCROLL_BASE_DURATION_MS + stationDistance * ROAD_SCROLL_PER_STATION_MS,
  );
  const startedAt = window.performance.now();

  const tick = (timestamp: number) => {
    const progress = Math.min(1, Math.max(0, (timestamp - startedAt) / duration));
    element.scrollLeft = start + (target - start) * easeInOutCubic(progress);
    onUpdate();

    if (progress < 1) {
      frameStore.current = window.requestAnimationFrame(tick);
    } else {
      frameStore.current = undefined;
      element.scrollLeft = target;
      onUpdate();
    }
  };

  frameStore.current = window.requestAnimationFrame(tick);
}

function viewportRoadProgress(viewport: HTMLDivElement): number {
  const maxScroll = Math.max(0, viewport.scrollWidth - viewport.clientWidth);
  return maxScroll > 0
    ? Math.min(1, Math.max(0, viewport.scrollLeft / maxScroll))
    : 0;
}

function scrollLeftForStation(
  viewport: HTMLDivElement,
  stationIndex: number,
  stationCount: number,
): number {
  const lastStationIndex = Math.max(0, stationCount - 1);
  if (lastStationIndex === 0) return 0;
  const clampedIndex = Math.min(lastStationIndex, Math.max(0, stationIndex));
  const maxScroll = Math.max(0, viewport.scrollWidth - viewport.clientWidth);
  return maxScroll * clampedIndex / lastStationIndex;
}

function readStoredScrollLeft(): number | undefined {
  try {
    const stored = window.sessionStorage.getItem(ROAD_SCROLL_STORAGE_KEY);
    if (stored === null) return undefined;
    const value = Number(stored);
    return Number.isFinite(value) && value >= 0 ? value : undefined;
  } catch {
    return undefined;
  }
}

function syncBusToViewport(
  bus: HTMLImageElement | null,
  viewport: HTMLDivElement,
  stations: RoadStation[],
): void {
  if (!bus) return;
  const progress = viewportRoadProgress(viewport);
  const pose = getRoadPose(stations, progress);
  const busX = pose.x;
  const busY = pose.y - TRAIN_RAIL_OVERLAP;
  const angle = Math.min(MAX_BUS_ANGLE, Math.max(-MAX_BUS_ANGLE, pose.angle));

  bus.style.setProperty("--bus-x", `${busX}px`);
  bus.style.setProperty("--bus-y", `${busY}px`);
  bus.style.setProperty("--bus-angle", `${angle}deg`);
  bus.dataset.roadProgress = progress.toFixed(4);
  bus.dataset.roadStep = String(Math.round(progress * Math.max(0, stations.length - 1)));
}

export const RoadTimeline = forwardRef<RoadTimelineHandle, RoadTimelineProps>(
  function RoadTimeline({ project, assetUrls, initialEntryId }, ref) {
    const navigation = useReaderNavigation();
    const reducedMotion = useReducedMotion();
    const viewportRef = useRef<HTMLDivElement>(null);
    const busRef = useRef<HTMLImageElement>(null);
    const dragRef = useRef<DragState | undefined>(undefined);
    const scrollFrameRef = useRef<number | undefined>(undefined);
    const roadAnimationFrameRef = useRef<number | undefined>(undefined);
    const targetStationRef = useRef<number | undefined>(undefined);
    const [dragging, setDragging] = useState(false);

    const entries = useMemo(() => orderEntries(project.entries), [project.entries]);
    const phasesById = useMemo(
      () => new Map(project.phases.map((phase) => [phase.id, phase])),
      [project.phases],
    );
    const assetsById = useMemo(
      () => new Map(project.assets.map((asset) => [asset.id, asset])),
      [project.assets],
    );

    // The route reserves its first and final points for the open-road terminals.
    const geometry = useMemo(() => buildRoadGeometry(entries.length + 2), [entries.length]);
    const activityStations = useMemo(() => geometry.stations.slice(1, -1), [geometry.stations]);
    const startStation = geometry.stations[0]!;
    const finishStation = geometry.stations.at(-1)!;

    const positionedEntries = useMemo<PositionedEntry[]>(
      () =>
        entries.map((entry, index) => {
          const station = activityStations[index]!;
          const aboveRoad = index % 2 === 0;
          const cardTop = aboveRoad
            ? Math.max(20, station.y - CARD_HEIGHT - 70)
            : Math.min(ROAD_HEIGHT - CARD_HEIGHT - 20, station.y + 74);
          const cardLeft = Math.min(
            geometry.width - CARD_WIDTH - 28,
            Math.max(28, station.x - CARD_WIDTH / 2),
          );
          return {
            entry,
            station,
            phase: phasesById.get(entry.phaseId),
            cardLeft,
            cardTop,
            aboveRoad,
          };
        }),
      [activityStations, entries, geometry.width, phasesById],
    );

    useLayoutEffect(() => {
      const viewport = viewportRef.current;
      if (!viewport) return;

      const stored = readStoredScrollLeft();
      if (stored !== undefined) {
        viewport.scrollLeft = stored;
      } else if (initialEntryId) {
        const index = entries.findIndex((entry) => entry.id === initialEntryId);
        if (index >= 0) {
          viewport.scrollLeft = scrollLeftForStation(
            viewport,
            index + 1,
            geometry.stations.length,
          );
        }
      }

      const sync = () => syncBusToViewport(busRef.current, viewport, geometry.stations);
      sync();
      window.addEventListener("resize", sync);
      return () => {
        window.removeEventListener("resize", sync);
        if (scrollFrameRef.current !== undefined) {
          window.cancelAnimationFrame(scrollFrameRef.current);
          scrollFrameRef.current = undefined;
        }
        cancelRoadScroll(roadAnimationFrameRef);
      };
    }, [entries, geometry.stations, initialEntryId]);

    useImperativeHandle(
      ref,
      () => ({
        scrollToPhase(phaseId: string) {
          const index = entries.findIndex((entry) => entry.phaseId === phaseId);
          const viewport = viewportRef.current;
          if (!viewport || index < 0) return;
          const stationIndex = index + 1;
          targetStationRef.current = stationIndex;
          scrollToLeft(
            viewport,
            scrollLeftForStation(viewport, stationIndex, geometry.stations.length),
            reducedMotion,
            geometry.stations.length,
            roadAnimationFrameRef,
            () => syncBusToViewport(busRef.current, viewport, geometry.stations),
          );
          viewport.focus({ preventScroll: true });
        },
      }),
      [entries, geometry.stations, reducedMotion],
    );

    function moveRoad(direction: -1 | 1): void {
      const viewport = viewportRef.current;
      const lastStationIndex = geometry.stations.length - 1;
      if (!viewport || lastStationIndex < 1) return;

      const position = viewportRoadProgress(viewport) * lastStationIndex;
      const currentStation = targetStationRef.current ?? (direction > 0
        ? Math.floor(position + ROAD_STEP_EPSILON)
        : Math.ceil(position - ROAD_STEP_EPSILON));
      const targetStation = Math.min(
        lastStationIndex,
        Math.max(0, currentStation + direction),
      );

      targetStationRef.current = targetStation;
      scrollToLeft(
        viewport,
        scrollLeftForStation(viewport, targetStation, geometry.stations.length),
        reducedMotion,
        geometry.stations.length,
        roadAnimationFrameRef,
        () => syncBusToViewport(busRef.current, viewport, geometry.stations),
      );
    }

    function handleKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        moveRoad(-1);
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        moveRoad(1);
      }
    }

    function handlePointerDown(event: PointerEvent<HTMLDivElement>): void {
      cancelRoadScroll(roadAnimationFrameRef);
      targetStationRef.current = undefined;
      if (event.button !== 0 || (event.target as HTMLElement).closest("a, button")) return;
      dragRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startScrollLeft: event.currentTarget.scrollLeft,
      };
      event.currentTarget.setPointerCapture(event.pointerId);
      setDragging(true);
    }

    function handlePointerMove(event: PointerEvent<HTMLDivElement>): void {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      event.currentTarget.scrollLeft = drag.startScrollLeft - (event.clientX - drag.startX);
    }

    function endPointerDrag(event: PointerEvent<HTMLDivElement>): void {
      if (dragRef.current?.pointerId !== event.pointerId) return;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      dragRef.current = undefined;
      setDragging(false);
    }

    function persistScrollPosition(viewport: HTMLDivElement): void {
      try {
        window.sessionStorage.setItem(ROAD_SCROLL_STORAGE_KEY, String(viewport.scrollLeft));
      } catch {
        // Session storage is an enhancement; navigation still works when it is unavailable.
      }
    }

    function rememberScrollPosition(): void {
      const viewport = viewportRef.current;
      if (viewport) persistScrollPosition(viewport);
    }

    function handleRoadScroll(): void {
      if (scrollFrameRef.current !== undefined) return;
      scrollFrameRef.current = window.requestAnimationFrame(() => {
        scrollFrameRef.current = undefined;
        const viewport = viewportRef.current;
        if (!viewport) return;
        syncBusToViewport(busRef.current, viewport, geometry.stations);
        persistScrollPosition(viewport);
      });
    }

    function handleRoadWheel(): void {
      cancelRoadScroll(roadAnimationFrameRef);
      targetStationRef.current = undefined;
    }

    return (
      <section className="road-timeline" aria-labelledby="road-timeline-title">
        <div className="road-timeline__toolbar">
          <div>
            <span className="road-timeline__eyebrow">沿途记忆</span>
            <h2 id="road-timeline-title">从出发，到下一站</h2>
          </div>
          <div className="road-timeline__controls" aria-label="线路浏览控制">
            <IconButton
              className="road-control"
              icon={ChevronLeft}
              label="前往上一站"
              onClick={() => moveRoad(-1)}
            />
            <IconButton
              className="road-control"
              icon={ChevronRight}
              label="前往下一站"
              onClick={() => moveRoad(1)}
            />
          </div>
        </div>

        <div
          ref={viewportRef}
          className={`road-viewport${dragging ? " is-dragging" : ""}`}
          role="region"
          aria-label="社会实践旅途时间线"
          tabIndex={0}
          onKeyDown={handleKeyDown}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={endPointerDrag}
          onPointerCancel={endPointerDrag}
          onWheel={handleRoadWheel}
          onScroll={handleRoadScroll}
        >
          <div
            className={`road-world${reducedMotion ? "" : " is-motion-enabled"}`}
            style={
              {
                width: geometry.width,
                height: ROAD_HEIGHT,
                "--field-panorama": `url(${FIELD_PANORAMA_URL})`,
              } as CSSProperties
            }
          >
            <svg
              className="road-canvas"
              width={geometry.width}
              height={ROAD_HEIGHT}
              viewBox={`0 0 ${geometry.width} ${ROAD_HEIGHT}`}
              aria-hidden="true"
            >
              <path
                className="track-line track-line--slab"
                data-track-layer="slab"
                d={geometry.path}
                pathLength="1"
              />
              <g data-track-layer="rail" aria-hidden="true">
                <path
                  className="track-line track-line--rail"
                  d={geometry.path}
                  pathLength="1"
                  transform={`translate(0 ${-TRACK_RAIL_OFFSET})`}
                />
                <path
                  className="track-line track-line--rail"
                  d={geometry.path}
                  pathLength="1"
                  transform={`translate(0 ${TRACK_RAIL_OFFSET})`}
                />
              </g>
              <path
                className="track-line track-line--contact"
                data-track-layer="contact"
                d={geometry.path}
                pathLength="1"
                transform={`translate(0 ${-TRACK_CONTACT_OFFSET})`}
              />
              <path
                className="track-line track-line--messenger"
                data-track-layer="messenger"
                d={geometry.path}
                pathLength="1"
                transform={`translate(0 ${-TRACK_MESSENGER_OFFSET})`}
              />

              {positionedEntries.map(({ entry, station, phase, cardTop, aboveRoad }) => (
                <g key={entry.id}>
                  <line
                    className="track-pole"
                    x1={station.x}
                    x2={station.x}
                    y1={station.y - TRACK_POLE_TOP_OFFSET}
                    y2={station.y + TRACK_POLE_BOTTOM_OFFSET}
                  />
                  <line
                    className="track-arm"
                    x1={station.x - TRACK_ARM_SPAN}
                    x2={station.x + TRACK_ARM_SPAN}
                    y1={station.y - TRACK_POLE_TOP_OFFSET}
                    y2={station.y - TRACK_POLE_TOP_OFFSET}
                  />
                  <line
                    className="track-dropper"
                    x1={station.x - TRACK_ARM_SPAN}
                    x2={station.x - TRACK_ARM_SPAN}
                    y1={station.y - TRACK_POLE_TOP_OFFSET}
                    y2={station.y - TRACK_MESSENGER_OFFSET}
                  />
                  <line
                    className="track-dropper"
                    x1={station.x + TRACK_ARM_SPAN}
                    x2={station.x + TRACK_ARM_SPAN}
                    y1={station.y - TRACK_POLE_TOP_OFFSET}
                    y2={station.y - TRACK_MESSENGER_OFFSET}
                  />
                  <line
                    className="road-station__stem"
                    x1={station.x}
                    x2={station.x}
                    y1={station.y}
                    y2={aboveRoad ? cardTop + CARD_HEIGHT : cardTop}
                  />
                  <circle
                    className="road-station__ring"
                    cx={station.x}
                    cy={station.y}
                    r="15"
                  />
                  <circle
                    cx={station.x}
                    cy={station.y}
                    r="9"
                    fill={phase?.color ?? "#F1C659"}
                  />
                </g>
              ))}
            </svg>

            <img
              ref={busRef}
              className="road-bus"
              src={VEHICLE_URL}
              alt=""
              aria-hidden="true"
              data-road-progress="0.0000"
              data-road-step="0"
              style={
                {
                  "--bus-x": `${startStation.x}px`,
                  "--bus-y": `${startStation.y - TRAIN_RAIL_OVERLAP}px`,
                  "--bus-angle": "0deg",
                } as CSSProperties
              }
            />

            <div
              className="road-terminal road-terminal--start"
              style={{ left: startStation.x - 38, top: startStation.y + 58 }}
              aria-label="线路起点：出发"
            >
              <Flag aria-hidden="true" size={17} />
              <span>出发</span>
            </div>

            {positionedEntries.map(({ entry, station, phase, cardLeft, cardTop, aboveRoad }, index) => {
              const EntryIcon = entryIcons[entry.icon];
              const thumbnail = entryThumbnail(entry, assetsById, assetUrls);
              const isFirstInPhase = entries.findIndex((item) => item.phaseId === entry.phaseId) === index;
              return (
                <Link
                  key={entry.id}
                  className={`journey-station-card ${aboveRoad ? "is-above" : "is-below"}`}
                  to={`${navigation.journalPath.replace(/[?#].*$/, "")}/${entry.id}${navigation.journalPath.includes("?") ? `?${navigation.journalPath.split("?", 2)[1]}` : ""}`}
                  onClick={rememberScrollPosition}
                  aria-label={`打开手账：${entry.title}`}
                  data-phase-id={isFirstInPhase ? entry.phaseId : undefined}
                  style={
                    {
                      left: cardLeft,
                      top: cardTop,
                      "--phase-color": phase?.color ?? "#F1C659",
                      "--station-x": `${station.x}px`,
                    } as CSSProperties
                  }
                >
                  <span className="journey-station-card__tape" aria-hidden="true" />
                  <span className="journey-station-card__heading">
                    <span className="journey-station-card__icon" aria-hidden="true">
                      <EntryIcon size={21} strokeWidth={2.35} />
                    </span>
                    <span>
                      <span className="journey-station-card__phase">{phase?.title ?? "旅程记录"}</span>
                      <time dateTime={entry.date}>{formatDate(entry.date)}</time>
                    </span>
                  </span>
                  <strong>{entry.title}</strong>
                  <span className="journey-station-card__body">
                    {thumbnail ? <img src={thumbnail.src} alt={thumbnail.alt} /> : null}
                    <span>{entry.summary}</span>
                  </span>
                  {entry.location ? (
                    <span className="journey-station-card__location">
                      <MapPin aria-hidden="true" size={13} />
                      {entry.location}
                    </span>
                  ) : null}
                </Link>
              );
            })}

            {entries.length === 0 ? (
              <div className="road-empty-note" style={{ left: 360, top: 178 }}>
                <strong>旅程尚未启程</strong>
                <span>第一段实践记忆，会从这条铁路开始。</span>
              </div>
            ) : null}

            <div
              className="road-terminal road-terminal--finish"
              style={
                {
                  left: finishStation.x - 38,
                  top: finishStation.y
                    - ROAD_HALF_WIDTH
                    - TERMINAL_SIGN_HEIGHT
                    - FINISH_TERMINAL_POST_HEIGHT,
                  "--terminal-post-height": `${FINISH_TERMINAL_POST_HEIGHT}px`,
                } as CSSProperties
              }
              aria-label="线路终点：抵达"
            >
              <Flag aria-hidden="true" size={17} />
              <span>抵达</span>
            </div>
          </div>
        </div>
      </section>
    );
  },
);
