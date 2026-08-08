import {
  ArrowLeft,
  ArrowRight,
  BookMarked,
  CalendarDays,
  Camera,
  CloudSun,
  ExternalLink,
  Heart,
  LockKeyhole,
  MailOpen,
  MapPin,
  Music2,
  Pause,
  Play,
  Sparkles,
  Users,
  X,
  ZoomIn,
} from "lucide-react";
import {
  forwardRef,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { createPortal } from "react-dom";
import HTMLFlipBook from "react-pageflip";
import type { AssetRepository } from "../../data/contentRepository";
import {
  MISSING_ASSET_PATH,
  resolveAssetUrl,
  revokeResolvedAssetUrl,
} from "../../data/assetResolver";
import { orderEntries } from "../../domain/orderEntries";
import type {
  AssetVariantName,
  PracticeEntry,
  PracticePhoto,
  PracticeProject,
} from "../../domain/practice";
import {
  buildJournalPages,
  isFutureLetterUnlocked,
  type JournalLeaf,
} from "./buildJournalPages";
import "./journal.css";

interface FlipBookApi {
  flipNext(corner?: "top" | "bottom"): void;
  flipPrev(corner?: "top" | "bottom"): void;
  turnToPage(pageIndex: number): void;
}

interface FlipBookHandle {
  pageFlip(): FlipBookApi;
}

export interface PracticeBookProps {
  project: PracticeProject;
  initialEntryId?: string | null;
  reducedMotion?: boolean;
  assets?: AssetRepository;
  now?: string;
}

interface LeafProps {
  leaf: JournalLeaf;
  pageNumber: number;
  project: PracticeProject;
  assets?: AssetRepository;
  now: string;
  onOpenPhoto: (photo: JournalPhotoPreview) => void;
}

interface JournalPhotoPreview {
  photoId: string;
  src: string;
  alt: string;
  caption?: string;
  trigger: HTMLButtonElement;
}

function getPublishedAssetPath(path: string | undefined): string | undefined {
  if (!path) return undefined;
  if (/^(?:https?:|blob:|data:)/.test(path) || path.startsWith("/")) return path;
  return `/content/${path.replace(/^\/+/, "")}`;
}

function useAssetUrl(
  project: PracticeProject,
  assetId: string | undefined,
  variant: AssetVariantName,
  assets?: AssetRepository,
): string | undefined {
  const asset = project.assets.find((candidate) => candidate.id === assetId);
  const variantData = asset?.variants[variant];
  const publishedPath = getPublishedAssetPath(variantData?.path);
  const resolutionKey = `${assetId ?? ""}:${variant}:${publishedPath ?? ""}:${variantData?.byteSize ?? ""}`;
  const [resolution, setResolution] = useState<{ key: string; url?: string }>();
  const url = resolution?.key === resolutionKey ? resolution.url : publishedPath;

  useEffect(() => {
    let active = true;
    let resolvedUrl: string | undefined;

    if (!assetId || !asset || !variantData || !assets) return () => undefined;

    void resolveAssetUrl({
      assetId,
      variant,
      localBlob: (id, name) => assets?.get(id, name) ?? Promise.resolve(undefined),
      publishedPath,
    })
      .then((nextUrl) => {
        resolvedUrl = nextUrl;
        if (!active) {
          revokeResolvedAssetUrl(nextUrl);
          return;
        }
        setResolution({
          key: resolutionKey,
          url: nextUrl === MISSING_ASSET_PATH && variant === "audio" ? undefined : nextUrl,
        });
      })
      .catch(() => {
        if (!active) return;
        setResolution({
          key: resolutionKey,
          url: publishedPath ?? (variant === "audio" ? undefined : MISSING_ASSET_PATH),
        });
      });

    return () => {
      active = false;
      if (resolvedUrl) revokeResolvedAssetUrl(resolvedUrl);
    };
  }, [asset, assetId, assets, publishedPath, resolutionKey, variant, variantData]);

  return url;
}

function formatEntryDate(date: string): string {
  const [year = "", month = "", day = ""] = date.split("-");
  return `${year} · ${month} / ${day}`;
}

function formatUnlockTime(unlockAt: string, timeZone: string): string {
  const date = new Date(unlockAt);
  if (Number.isNaN(date.getTime())) return unlockAt;
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone,
  }).format(date);
}

const MUSIC_PLATFORM_DOMAINS = [
  "163cn.tv",
  "music.163.com",
  "music.baidu.com",
  "music.taihe.com",
  "y.qq.com",
  "kugou.com",
  "kuwo.cn",
];

function getSafeBgmUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : undefined;
  } catch {
    return undefined;
  }
}

function isMusicPlatformUrl(value: string): boolean {
  const url = new URL(value);
  if (/\.(?:aac|flac|m4a|mp3|ogg|opus|wav)(?:$|[?#])/i.test(url.href)) return false;
  const hostname = url.hostname.toLowerCase();
  return MUSIC_PLATFORM_DOMAINS.some(
    (domain) => hostname === domain || hostname.endsWith(`.${domain}`),
  );
}

function BgmControl({ entry }: { entry: PracticeEntry }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [failedUrl, setFailedUrl] = useState<string>();
  const url = getSafeBgmUrl(entry.bgm?.url);
  const externalPlayback = Boolean(url && (isMusicPlatformUrl(url) || failedUrl === url));
  const title = entry.bgm?.title?.trim() || "暂未添加";

  useEffect(() => () => audioRef.current?.pause(), []);

  const toggle = async () => {
    const audio = audioRef.current;
    if (!audio || !url) return;
    if (!audio.paused) {
      audio.pause();
      return;
    }
    try {
      await audio.play();
    } catch {
      setPlaying(false);
      setFailedUrl(url);
    }
  };

  return (
    <section className="journal-bgm" aria-label="今日 BGM">
      <span className="journal-bgm__icon" aria-hidden="true"><Music2 size={22} /></span>
      <span className="journal-bgm__copy">
        <small>{externalPlayback ? "今日 BGM · 音乐平台" : "今日 BGM"}</small>
        <strong>{title}</strong>
      </span>
      {externalPlayback && url ? (
        <a
          className="journal-round-button journal-bgm__external"
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`在音乐平台打开今日 BGM：${title}`}
          title="在音乐平台打开"
        >
          <ExternalLink size={19} aria-hidden="true" />
        </a>
      ) : (
        <button
          type="button"
          className="journal-round-button"
          aria-label={`${playing ? "暂停" : "播放"}今日 BGM：${title}`}
          aria-pressed={playing}
          disabled={!url}
          onClick={() => void toggle()}
        >
          {playing ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" />}
        </button>
      )}
      {url && !externalPlayback ? (
        <audio
          ref={audioRef}
          src={url}
          preload="none"
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => setPlaying(false)}
          onError={() => {
            setPlaying(false);
            setFailedUrl(url);
          }}
        />
      ) : null}
    </section>
  );
}

function JournalPhoto({
  photo,
  index,
  project,
  assets,
  onOpen,
}: {
  photo: PracticePhoto;
  index: number;
  project: PracticeProject;
  assets?: AssetRepository;
  onOpen: (photo: JournalPhotoPreview) => void;
}) {
  const url = useAssetUrl(project, photo.assetId, "display", assets);
  const src = url ?? MISSING_ASSET_PATH;
  return (
    <figure className={`journal-photo journal-photo--${(index % 3) + 1}`}>
      <span className="journal-photo__tape" aria-hidden="true" />
      <button
        type="button"
        className="journal-photo__open"
        aria-label={`放大查看：${photo.alt}`}
        data-photo-id={photo.id}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.stopPropagation();
          onOpen({
            photoId: photo.id,
            src,
            alt: photo.alt,
            caption: photo.caption,
            trigger: event.currentTarget,
          });
        }}
      >
        <img src={src} alt={photo.alt} loading="lazy" />
        <span className="journal-photo__zoom" aria-hidden="true"><ZoomIn size={16} /></span>
      </button>
      {photo.caption ? <figcaption>{photo.caption}</figcaption> : null}
    </figure>
  );
}

function PhotoLightbox({
  photo,
  onClose,
}: {
  photo: JournalPhotoPreview;
  onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();

    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
      if (event.key === "Tab") {
        event.preventDefault();
        closeRef.current?.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose, photo]);

  const close = () => {
    onClose();
  };

  return (
    <div
      className="journal-lightbox"
      role="dialog"
      aria-modal="true"
      aria-label={`查看照片：${photo.alt}`}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <div className="journal-lightbox__panel">
        <div className="journal-lightbox__toolbar">
          <button
            ref={closeRef}
            type="button"
            className="journal-lightbox__close"
            aria-label="关闭照片预览"
            title="关闭照片预览"
            onClick={close}
          >
            <X aria-hidden="true" size={22} />
          </button>
        </div>
        <figure className="journal-lightbox__figure">
          <img src={photo.src} alt={photo.alt} />
          {photo.caption ? <figcaption>{photo.caption}</figcaption> : null}
        </figure>
      </div>
    </div>
  );
}

function MemberAvatar({
  project,
  assetId,
  name,
  assets,
}: {
  project: PracticeProject;
  assetId?: string;
  name: string;
  assets?: AssetRepository;
}) {
  const url = useAssetUrl(project, assetId, "thumbnail", assets);
  if (!assetId || !url) {
    return <span className="member-avatar member-avatar--placeholder" aria-hidden="true">{name.slice(0, 1)}</span>;
  }
  return <img className="member-avatar" src={url} alt={`${name}的头像`} loading="lazy" />;
}

function ChapterLeaf({ leaf, project }: { leaf: Extract<JournalLeaf, { type: "chapter" }>; project: PracticeProject }) {
  const phase = project.phases.find((candidate) => candidate.id === leaf.phaseId);
  const entries = orderEntries(project.entries.filter((entry) => entry.phaseId === leaf.phaseId));
  if (leaf.side === "cover") {
    return (
      <div className="journal-chapter journal-chapter--cover">
        <span className="journal-chapter__number">CHAPTER {String((phase?.order ?? 0) + 1).padStart(2, "0")}</span>
        <span className="journal-chapter__spark" aria-hidden="true"><Sparkles size={28} /></span>
        <h2>{leaf.title}</h2>
        <p>把这一程的见闻，一页一页收进手账。</p>
      </div>
    );
  }

  return (
    <div className="journal-chapter journal-chapter--index">
      <span className="journal-chapter__number">CHAPTER {String((phase?.order ?? 0) + 1).padStart(2, "0")}</span>
      <h2>本章目录</h2>
      <p>{leaf.title}</p>
      <ol>
        {entries.map((entry) => (
          <li key={entry.id}>
            <span>{entry.date.slice(5).replace("-", ".")}</span>
            <strong>{entry.title}</strong>
          </li>
        ))}
      </ol>
    </div>
  );
}

function EntryTextLeaf({
  entry,
  project,
  leaf,
}: {
  entry: PracticeEntry;
  project: PracticeProject;
  leaf: Extract<JournalLeaf, { type: "entry-text" }>;
}) {
  const members = entry.memberIds
    .map((memberId) => project.members.find((member) => member.id === memberId))
    .filter((member) => member !== undefined);

  if (leaf.variant === "body") {
    return (
      <div className="journal-entry-text journal-entry-text--body-page">
        <header>
          <span className="journal-kicker"><BookMarked size={16} aria-hidden="true" /> 实践日记 · 正文</span>
          <h2>{entry.title}</h2>
          <div className="journal-entry-text__folio">
            <span className="journal-date"><CalendarDays size={17} aria-hidden="true" />{formatEntryDate(entry.date)}</span>
            <span>正文 {leaf.bodyPageIndex + 1} / {leaf.bodyPageCount}</span>
          </div>
        </header>
        <div className="journal-rule" aria-hidden="true" />
        <p className="journal-entry-text__body journal-entry-text__body--page">{leaf.body}</p>
      </div>
    );
  }

  return (
    <div className={`journal-entry-text${leaf.variant === "overview" ? " journal-entry-text--overview" : ""}`}>
      <header>
        <span className="journal-kicker"><BookMarked size={16} aria-hidden="true" /> 实践日记{leaf.variant === "overview" ? " · 概览" : ""}</span>
        <h2>{entry.title}</h2>
        <div className="journal-entry-text__folio">
          <span className="journal-date"><CalendarDays size={17} aria-hidden="true" />{formatEntryDate(entry.date)}</span>
          {leaf.variant === "overview" ? <span>正文共 {leaf.bodyPageCount} 页</span> : null}
        </div>
      </header>
      <div className="journal-rule" aria-hidden="true" />
      <p className="journal-entry-text__summary">{entry.summary}</p>
      {leaf.variant === "complete" ? <p className="journal-entry-text__body">{leaf.body}</p> : null}
      <dl className="journal-entry-meta">
        {entry.location ? <div><dt><MapPin size={17} aria-hidden="true" />地点</dt><dd>{entry.location}</dd></div> : null}
        {entry.weather ? <div><dt><CloudSun size={17} aria-hidden="true" />天气</dt><dd>{entry.weather}</dd></div> : null}
        {entry.mood ? <div><dt><Heart size={17} aria-hidden="true" />心情</dt><dd>{entry.mood}</dd></div> : null}
      </dl>
      {members.length > 0 ? (
        <div className="journal-companions">
          <span><Users size={16} aria-hidden="true" />同行伙伴</span>
          <div>{members.map((member) => <strong key={member.id}>{member.name}</strong>)}</div>
        </div>
      ) : null}
      <BgmControl entry={entry} />
    </div>
  );
}

function EntryPhotoLeaf({
  entry,
  project,
  assets,
  onOpenPhoto,
}: {
  entry: PracticeEntry;
  project: PracticeProject;
  assets?: AssetRepository;
  onOpenPhoto: (photo: JournalPhotoPreview) => void;
}) {
  const photos = [...entry.photos].sort((left, right) => left.order - right.order || left.id.localeCompare(right.id));
  return (
    <div className="journal-photo-page">
      <header>
        <span className="journal-kicker"><Camera size={16} aria-hidden="true" /> 影像存档</span>
        <h2>今日照片</h2>
        <p>{entry.title}</p>
      </header>
      {photos.length > 0 ? (
        <div className={`journal-photo-grid journal-photo-grid--${Math.min(photos.length, 3)}`}>
          {photos.map((photo, index) => (
            <JournalPhoto
              key={photo.id}
              photo={photo}
              index={index}
              project={project}
              assets={assets}
              onOpen={onOpenPhoto}
            />
          ))}
        </div>
      ) : (
        <div className="journal-empty-photo">
          <Camera size={34} aria-hidden="true" />
          <strong>照片位置已留好</strong>
          <span>实践开始后，把当天最珍贵的画面贴在这里。</span>
        </div>
      )}
    </div>
  );
}

function MembersLeaf({
  project,
  assets,
  leaf,
}: {
  project: PracticeProject;
  assets?: AssetRepository;
  leaf: Extract<JournalLeaf, { type: "members" }>;
}) {
  const members = leaf.memberIds
    .map((memberId) => project.members.find((member) => member.id === memberId))
    .filter((member) => member !== undefined);

  return (
    <div className="journal-members">
      <header>
        <span className="journal-kicker"><Users size={16} aria-hidden="true" /> 一起出发的人</span>
        <h2>成员高光</h2>
        <p>因为并肩同行，每一段路都有了不同的颜色。</p>
        {leaf.pageCount > 1 ? (
          <small className="journal-members__folio">MEMBERS {String(leaf.pageIndex + 1).padStart(2, "0")} / {String(leaf.pageCount).padStart(2, "0")}</small>
        ) : null}
      </header>
      <div className="journal-members__grid">
        {members.map((member, index) => (
          <section key={member.id} className={`journal-member journal-member--${(index % 3) + 1}`} aria-label={member.name}>
            <MemberAvatar project={project} assetId={member.avatarAssetId} name={member.name} assets={assets} />
            <h3>{member.name}</h3>
            <div>{member.highlights.map((highlight) => <span key={highlight}>{highlight}</span>)}</div>
          </section>
        ))}
      </div>
    </div>
  );
}

function FutureAudio({ project, assets, assetId }: { project: PracticeProject; assets?: AssetRepository; assetId: string }) {
  const url = useAssetUrl(project, assetId, "audio", assets);
  if (!url) return <p className="journal-future__audio-missing">录音暂时无法播放，文字内容仍可正常查看。</p>;
  return <audio className="journal-future__audio" src={url} controls preload="none">你的浏览器不支持音频播放。</audio>;
}

function FutureLetterLeaf({ project, assets, now }: { project: PracticeProject; assets?: AssetRepository; now: string }) {
  const letter = project.futureLetter;
  if (!letter) {
    return (
      <div className="journal-future journal-future--empty">
        <MailOpen size={48} aria-hidden="true" />
        <h2>致未来的自己</h2>
        <p>信封已经准备好，等实践结束时再写下想对未来说的话。</p>
      </div>
    );
  }

  const unlocked = isFutureLetterUnlocked(letter.unlockAt, now);
  if (!unlocked) {
    return (
      <div className="journal-future journal-future--locked">
        <span className="journal-future__seal" aria-hidden="true"><LockKeyhole size={34} /></span>
        <h2>致未来的自己</h2>
        <p>这封信正在时光里慢慢前行。</p>
        <time dateTime={letter.unlockAt}>{formatUnlockTime(letter.unlockAt, project.timeZone)} 解锁</time>
        <small>纪念性封存，不提供保密性</small>
      </div>
    );
  }

  return (
    <div className="journal-future journal-future--open">
      <span className="journal-future__seal" aria-hidden="true"><MailOpen size={34} /></span>
      <span className="journal-kicker">时光慢递 · 已抵达</span>
      <h2>致未来的自己</h2>
      <blockquote>{letter.message}</blockquote>
      {letter.audioAssetId ? <FutureAudio project={project} assets={assets} assetId={letter.audioAssetId} /> : null}
    </div>
  );
}

function getLeafLabel(leaf: JournalLeaf, project: PracticeProject): string {
  if (leaf.type === "chapter") return `${leaf.title}章节`;
  if (leaf.type === "members") {
    return leaf.pageCount > 1
      ? `成员高光，第 ${leaf.pageIndex + 1} / ${leaf.pageCount} 页`
      : "成员高光";
  }
  if (leaf.type === "future-letter") return "致未来的自己";
  const entry = project.entries.find((candidate) => candidate.id === leaf.entryId);
  if (!entry) return "活动记录已移除";
  if (leaf.type === "entry-photos") return `${entry.title}的今日照片`;
  return leaf.variant === "body"
    ? `${entry.title}，正文 ${leaf.bodyPageIndex + 1} / ${leaf.bodyPageCount}`
    : entry.title;
}

const JournalLeafArticle = forwardRef<HTMLElement, LeafProps>(function JournalLeafArticle(
  { leaf, pageNumber, project, assets, now, onOpenPhoto },
  ref,
) {
  const entry = "entryId" in leaf
    ? project.entries.find((candidate) => candidate.id === leaf.entryId)
    : undefined;

  return (
    <article ref={ref} className={`journal-leaf journal-leaf--${leaf.type}`} aria-label={getLeafLabel(leaf, project)}>
      <div className="journal-leaf__paper">
        {leaf.type === "chapter" ? <ChapterLeaf leaf={leaf} project={project} /> : null}
        {leaf.type === "entry-text" && entry ? <EntryTextLeaf entry={entry} project={project} leaf={leaf} /> : null}
        {leaf.type === "entry-photos" && entry ? (
          <EntryPhotoLeaf entry={entry} project={project} assets={assets} onOpenPhoto={onOpenPhoto} />
        ) : null}
        {leaf.type === "members" ? <MembersLeaf project={project} assets={assets} leaf={leaf} /> : null}
        {leaf.type === "future-letter" ? <FutureLetterLeaf project={project} assets={assets} now={now} /> : null}
        {!entry && (leaf.type === "entry-text" || leaf.type === "entry-photos") ? (
          <div className="journal-missing-leaf"><h2>这段记录已经移除</h2><p>请从手账目录选择其他活动。</p></div>
        ) : null}
        <span className="journal-leaf__page-number" aria-hidden="true">{String(pageNumber + 1).padStart(2, "0")}</span>
      </div>
    </article>
  );
});

function resolveInitialPage(
  initialEntryId: string | null | undefined,
  entryPageIndex: Map<string, number>,
  project: PracticeProject,
): number {
  if (initialEntryId === null) return 0;
  if (initialEntryId) return entryPageIndex.get(initialEntryId) ?? 0;
  const firstEntry = orderEntries(project.entries)[0];
  return firstEntry ? entryPageIndex.get(firstEntry.id) ?? 0 : 0;
}

function getCurrentEntryId(leaf: JournalLeaf | undefined): string | undefined {
  return leaf && "entryId" in leaf ? leaf.entryId : undefined;
}

export function PracticeBook({
  project,
  initialEntryId,
  reducedMotion,
  assets,
  now = new Date().toISOString(),
}: PracticeBookProps) {
  const { pages, entryPageIndex } = useMemo(() => buildJournalPages(project), [project]);
  const initialPage = resolveInitialPage(initialEntryId, entryPageIndex, project);
  const [pageState, setPageState] = useState({ initialPage, currentPage: initialPage });
  const [photoPreview, setPhotoPreview] = useState<JournalPhotoPreview>();
  const bookRef = useRef<FlipBookHandle | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const pendingPhotoFocusRef = useRef<JournalPhotoPreview | undefined>(undefined);
  const motionIsReduced = reducedMotion ?? (
    typeof window === "undefined" || typeof window.matchMedia !== "function"
      ? true
      : window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
  const currentPage = pageState.initialPage === initialPage ? pageState.currentPage : initialPage;
  const currentLeaf = pages[currentPage];
  const currentEntryId = getCurrentEntryId(currentLeaf);

  useEffect(() => {
    const pendingPhoto = pendingPhotoFocusRef.current;
    if (photoPreview || !pendingPhoto) return;

    const focusTimer = window.setTimeout(() => {
      const candidates = [...document.querySelectorAll<HTMLButtonElement>("[data-photo-id]")]
        .filter((element) => element.dataset.photoId === pendingPhoto.photoId);
      const currentTrigger = candidates.find((element) => {
        const bounds = element.getBoundingClientRect();
        return bounds.width > 0 && bounds.height > 0 && getComputedStyle(element).visibility !== "hidden";
      });
      currentTrigger?.focus();
      if (document.activeElement !== currentTrigger) stageRef.current?.focus();
      pendingPhotoFocusRef.current = undefined;
    }, 80);

    return () => window.clearTimeout(focusTimer);
  }, [photoPreview]);

  const closePhotoPreview = () => {
    if (!photoPreview) return;
    pendingPhotoFocusRef.current = photoPreview;
    setPhotoPreview(undefined);
  };

  const setCurrentPage = (nextPage: number) => {
    setPageState({ initialPage, currentPage: nextPage });
  };

  const goToPage = (nextPage: number) => {
    const boundedPage = Math.max(0, Math.min(pages.length - 1, nextPage));
    if (motionIsReduced) {
      setCurrentPage(boundedPage);
    } else {
      bookRef.current?.pageFlip().turnToPage(boundedPage);
    }
  };

  const previous = () => {
    if (currentPage <= 0) return;
    if (motionIsReduced) setCurrentPage(Math.max(0, currentPage - 1));
    else bookRef.current?.pageFlip().flipPrev("bottom");
  };

  const next = () => {
    if (currentPage >= pages.length - 1) return;
    if (motionIsReduced) setCurrentPage(Math.min(pages.length - 1, currentPage + 1));
    else bookRef.current?.pageFlip().flipNext("bottom");
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      previous();
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      next();
    }
  };

  const phases = [...project.phases].sort(
    (left, right) => left.order - right.order || left.id.localeCompare(right.id),
  );

  return (
    <div className={`practice-book ${motionIsReduced ? "practice-book--reduced" : "practice-book--flip"}`}>
      <aside className="journal-directory" aria-label="手账目录">
        <span className="journal-directory__eyebrow">TRAVEL NOTES</span>
        <h2>手账目录</h2>
        <div className="journal-directory__chapters">
          {phases.map((phase) => {
            const entries = orderEntries(project.entries.filter((entry) => entry.phaseId === phase.id));
            return (
              <section key={phase.id} style={{ "--phase-color": phase.color } as React.CSSProperties}>
                <h3>{phase.title}</h3>
                {entries.map((entry) => (
                  <button
                    key={entry.id}
                    type="button"
                    className={currentEntryId === entry.id ? "is-current" : undefined}
                    aria-current={currentEntryId === entry.id ? "page" : undefined}
                    onClick={() => goToPage(entryPageIndex.get(entry.id) ?? 0)}
                  >
                    <span>{entry.date.slice(5).replace("-", ".")}</span>
                    {entry.title}
                  </button>
                ))}
              </section>
            );
          })}
        </div>
        <div className="journal-directory__endings">
          <button type="button" onClick={() => goToPage(pages.findIndex((page) => page.type === "members"))}>
            <Users size={15} aria-hidden="true" />成员墙
          </button>
          <button type="button" onClick={() => goToPage(pages.findIndex((page) => page.type === "future-letter"))}>
            <MailOpen size={15} aria-hidden="true" />未来信
          </button>
        </div>
      </aside>

      <div ref={stageRef} className="practice-book__stage" tabIndex={0} onKeyDown={handleKeyDown} aria-label="翻页手账阅读区">
        <div className="practice-book__binding" aria-hidden="true" />
        {motionIsReduced ? (
          currentLeaf ? (
            <div className="practice-book__single-page" aria-live="polite">
              <JournalLeafArticle
                key={currentLeaf.id}
                leaf={currentLeaf}
                pageNumber={currentPage}
                project={project}
                assets={assets}
                now={now}
                onOpenPhoto={setPhotoPreview}
              />
            </div>
          ) : null
        ) : (
          <HTMLFlipBook
            key={`book:${initialPage}`}
            ref={bookRef}
            className="practice-book__flipbook"
            style={{}}
            width={520}
            height={650}
            size="fixed"
            minWidth={520}
            maxWidth={520}
            minHeight={650}
            maxHeight={650}
            startPage={initialPage}
            drawShadow
            flippingTime={680}
            usePortrait={false}
            startZIndex={0}
            autoSize
            maxShadowOpacity={0.32}
            showCover={false}
            mobileScrollSupport={false}
            clickEventForward
            useMouseEvents
            swipeDistance={36}
            showPageCorners
            disableFlipByClick
            onFlip={(event) => setCurrentPage(Number(event.data))}
          >
            {pages.map((leaf, pageNumber) => (
              <JournalLeafArticle
                key={leaf.id}
                leaf={leaf}
                pageNumber={pageNumber}
                project={project}
                assets={assets}
                now={now}
                onOpenPhoto={setPhotoPreview}
              />
            ))}
          </HTMLFlipBook>
        )}
      </div>

      <nav className="journal-pagination" aria-label="手账翻页">
        <button type="button" aria-label="上一页" disabled={currentPage <= 0} onClick={previous}>
          <ArrowLeft size={19} aria-hidden="true" />
        </button>
        <span><strong>{currentPage + 1}</strong> / {pages.length}</span>
        <button type="button" aria-label="下一页" disabled={currentPage >= pages.length - 1} onClick={next}>
          <ArrowRight size={19} aria-hidden="true" />
        </button>
      </nav>
      {photoPreview
        ? createPortal(
            <PhotoLightbox photo={photoPreview} onClose={closePhotoPreview} />,
            document.body,
          )
        : null}
    </div>
  );
}
