import { Fragment, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { mediaPath, videoPositionMs, type ReleasedScene } from '../../shared/scenes';
import { useMedia, useMediaCache, type MediaCache } from '../net/media';

interface StageProps {
  /** Scenes released so far by the server (never future ones). */
  scenes: ReleasedScene[];
  roundId: string;
  token: string;
  /** Estimated server time (ms), used to align video playback. */
  serverNow: number;
  questionNumber: number;
  /** Projector only, after an explicit click: play video with sound. Player devices stay muted. */
  audio?: boolean;
  /** Called when the browser refuses unmuted playback (autoplay policy); playback continues muted. */
  onAudioBlocked?: () => void;
}

const SLOW_LOAD_MS = 1200;
const TRANSITION_MS = 650;
const VIDEO_DRIFT_S = 0.35;

/**
 * Plays the server-released scene timeline in a fixed 16:9 frame.
 * - The newest released scene is loaded in a hidden layer; the previous scene stays visible until
 *   the new one is ready (no black flash, no layout shift). It then enters with its transition.
 * - The client never advances on its own: it only shows what the server has released.
 */
export function SceneStage(props: StageProps) {
  // A fresh stage per round: keying by round id resets all stage state without a reset effect
  // (an effect would run after the children's and could discard a scene that is already ready).
  return <RoundStage key={props.roundId} {...props} />;
}

function RoundStage({ scenes, roundId, token, serverNow, questionNumber, audio = false, onAudioBlocked }: StageProps) {
  const cache = useMediaCache(token, roundId);
  const latest = scenes[scenes.length - 1] ?? null;
  // Fixed when a scene becomes visible: whether its entrance waits for the previous scene to fade out
  // (any change that involves a text scene). Video→video changes stay true cross-fades.
  const [{ shown, previous, quick }, setPresentation] = useState<{
    shown: ReleasedScene | null;
    previous: ReleasedScene | null;
    quick: boolean;
  }>({ shown: null, previous: null, quick: false });
  const [slow, setSlow] = useState(false);
  const latestId = useRef(latest?.id);
  latestId.current = latest?.id;

  const pending = latest && latest.id !== shown?.id ? latest : null;

  useEffect(() => {
    setSlow(false);
    if (!pending) return;
    const t = setTimeout(() => setSlow(true), SLOW_LOAD_MS);
    return () => clearTimeout(t);
  }, [pending?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!previous) return;
    const t = setTimeout(() => setPresentation((cur) => ({ ...cur, previous: null })), TRANSITION_MS);
    return () => clearTimeout(t);
  }, [previous]);

  const onPendingReady = (scene: ReleasedScene) => {
    // A late decode callback must not bring an older clue back after a newer release.
    if (scene.id !== latestId.current) return;
    setPresentation((cur) => {
      if (cur.shown?.id === scene.id) return cur;
      return { shown: scene, previous: cur.shown, quick: !!cur.shown && !(isMedia(cur.shown) && isMedia(scene)) };
    });
  };
  const layers = [previous, shown, pending].filter((s): s is ReleasedScene => s !== null);

  return (
    <section
      className="scene-stage"
      aria-label={`Câu hỏi ${questionNumber}`}
      data-scene-id={shown?.id ?? ''}
      data-scene-kind={shown?.kind ?? ''}
      data-scene-count={scenes.length}
    >
      {layers.map((scene) => {
        const active = scene.id === shown?.id;
        const exiting = scene.id === previous?.id;
        const className = active
          ? `scene-in scene-t-${scene.transition ?? 'fade'}${quick ? ' scene-in-after' : ''}`
          : exiting ? `scene-exit${quick ? ' scene-exit-quick' : ''}` : 'scene-pending';
        // One keyed subtree throughout pending → shown → previous: keep the decoded media element.
        return (
          <div className={`scene-layer ${className}`} key={scene.id} data-layer-scene-id={scene.id} aria-hidden={active ? undefined : true} aria-live={active ? 'polite' : undefined}>
            <SceneContent scene={scene} roundId={roundId} cache={cache} serverNow={serverNow} active={active} frozen={exiting}
              audio={audio} onAudioBlocked={onAudioBlocked} onReady={active || exiting ? undefined : () => onPendingReady(scene)} />
          </div>
        );
      })}
      {!shown && (
        <div className="scene-layer scene-neutral">
          <span className="scene-title">Câu hỏi {questionNumber}</span>
        </div>
      )}
      {pending && slow && shown && (
        <span className="scene-loading" role="status">
          Đang tải…
        </span>
      )}
    </section>
  );
}

const isMedia = (s: ReleasedScene) => s.kind === 'video' || s.kind === 'image';

interface ContentProps {
  scene: ReleasedScene;
  roundId: string;
  cache: MediaCache | null;
  serverNow: number;
  active: boolean;
  /** Outgoing media holds its decoded frame until its exit completes; never seek it. */
  frozen?: boolean;
  onReady?: () => void;
  audio?: boolean;
  onAudioBlocked?: () => void;
}

function SceneContent(props: ContentProps) {
  const { scene, onReady } = props;
  const readyFired = useRef(false);
  const ready = () => {
    if (readyFired.current) return;
    readyFired.current = true;
    onReady?.();
  };
  // Non-media scenes are ready immediately.
  useEffect(() => {
    if (scene.kind !== 'image' && scene.kind !== 'video') ready();
  }, [scene.id]); // eslint-disable-line react-hooks/exhaustive-deps

  switch (scene.kind) {
    case 'placeholder':
      return (
        <div className="scene-placeholder">
          <span className="scene-title">{scene.title}</span>
          {scene.subtitle && <span className="scene-subtitle">{scene.subtitle}</span>}
        </div>
      );
    case 'text-card':
      return (
        <FitBox className={`scene-text${scene.body.length > 140 ? ' is-long' : ''}`}>
          {scene.heading && <h3 className="scene-text-heading">{masked(scene.heading)}</h3>}
          <p className="scene-text-body">{masked(scene.body)}</p>
        </FitBox>
      );
    case 'date':
      return (
        <FitBox className="scene-datecard">
          <span className="scene-date-value">{scene.date}</span>
          {scene.label && <span className="scene-date-label">{masked(scene.label)}</span>}
        </FitBox>
      );
    case 'statistic':
      return (
        <FitBox className="scene-stat">
          {scene.demo && <span className="scene-demo-badge">Dữ liệu minh hoạ — không phải số liệu thật</span>}
          <span className="scene-stat-value">
            {scene.value}
            {scene.unit && <span className="scene-stat-unit">{scene.unit}</span>}
          </span>
          <span className="scene-stat-label">{masked(scene.label)}</span>
          {scene.source && <span className="scene-stat-source">Nguồn: {masked(scene.source)}</span>}
        </FitBox>
      );
    case 'image':
      return <ImageScene {...props} scene={scene} onReady={ready} />;
    case 'video':
      return <VideoScene {...props} scene={scene} onReady={ready} />;
  }
}

/**
 * Native text scenes fit the RENDERED stage, not a character count: after layout, if the content is
 * taller or wider than its layer, a scale factor (--fit) is lowered step by step until it fits. Every
 * size has a 16 px floor in CSS, so text never becomes unreadably small; at that floor the spacing is
 * tightened (.scene-fit-compact) before anything may wrap. Re-runs when the stage is
 * resized (rotation, full screen). No timers.
 */
function FitBox({ className, children }: { className: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const box = ref.current;
    const layer = box?.parentElement;
    if (!box || !layer) return;
    const fit = () => {
      let k = 1;
      // Measure the final layout: entrance animations (e.g. the date's letter-spacing) are suspended
      // for this synchronous pass only; nothing is painted in between.
      box.classList.add('scene-fit-measure');
      box.style.setProperty('--fit', '1');
      box.classList.remove('scene-masked-wrap', 'scene-fit-compact');
      // Overflow = content taller than the stage layer, or wider than its own box (e.g. a masked
      // answer that must stay on one line).
      const over = () => box.scrollHeight > layer.clientHeight - 2 || box.scrollWidth > box.clientWidth + 1;
      while (k > 0.55 && over()) {
        k = Math.round((k - 0.05) * 100) / 100;
        box.style.setProperty('--fit', String(k));
      }
      // At the size floor, tighten padding, gaps and line height (text sizes unchanged): a wider
      // fallback font can add a line that no longer fits on a phone.
      if (over()) box.classList.add('scene-fit-compact');
      // Last resort: let the masked boxes wrap rather than overflow the stage.
      if (over()) box.classList.add('scene-masked-wrap');
      box.classList.remove('scene-fit-measure');
      box.dataset.fit = String(k);
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(layer);
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={ref} className={`${className} scene-fit`}>
      {children}
    </div>
  );
}

/** Keeps the boxes of a masked answer ("▢▢▢ ▢▢▢") together on one line. */
function masked(raw: string): ReactNode {
  // A number and its percent sign never wrap apart ("85,8 %").
  const text = raw.replace(/(\d) %/g, '$1\u00a0%');
  const parts = text.split(/(▢+(?:[ \u00a0]▢+)*)/);
  if (parts.length === 1) return text;
  return parts.map((p, i) =>
    i % 2 ? (
      <span key={i} className="scene-masked">
        {p}
      </span>
    ) : (
      <Fragment key={i}>{p}</Fragment>
    ),
  );
}

function MediaFallback({ label }: { label: string }) {
  return (
    <div className="scene-placeholder scene-fallback" data-testid="media-fallback">
      <span className="scene-subtitle">{label}</span>
    </div>
  );
}

function ImageScene({ scene, roundId, cache, onReady }: ContentProps & { scene: Extract<ReleasedScene, { kind: 'image' }>; onReady: () => void }) {
  const { src, failed } = useMedia(cache, mediaPath(roundId, scene.media.assetId));
  useEffect(() => {
    if (failed) onReady();
  }, [failed]); // eslint-disable-line react-hooks/exhaustive-deps
  if (failed) return <MediaFallback label="Không tải được hình ảnh" />;
  return (
    <figure className="scene-media">
      {src && <img className="scene-img" src={src} alt="" draggable={false} onLoad={onReady} onError={onReady} />}
      {(scene.caption || scene.credit) && (
        <figcaption className="scene-caption">
          {scene.caption && <span>{scene.caption}</span>}
          {scene.credit && <span className="scene-credit">{scene.credit}</span>}
        </figcaption>
      )}
    </figure>
  );
}

function VideoScene({ scene, roundId, cache, serverNow, active, frozen = false, onReady, audio = false, onAudioBlocked }: ContentProps & { scene: Extract<ReleasedScene, { kind: 'video' }>; onReady: () => void }) {
  const { src, failed } = useMedia(cache, mediaPath(roundId, scene.media.assetId));
  const ref = useRef<HTMLVideoElement>(null);
  const [playbackFailed, setPlaybackFailed] = useState(false);
  const readyFrame = useRef<number | null>(null);

  // Keep the clip aligned with the authoritative timeline (late load, refresh, drift).
  const align = () => {
    const v = ref.current;
    if (v && frozen) {
      if (!v.paused) v.pause();
      return;
    }
    if (!v || !Number.isFinite(v.duration) || v.readyState < 1 || v.seeking) return;
    const target = videoPositionMs(scene, serverNow, v.duration * 1000) / 1000;
    const end = (scene.endMs ?? v.duration * 1000) / 1000;
    if (Math.abs(v.currentTime - target) > VIDEO_DRIFT_S) v.currentTime = Math.min(target, Math.max(0, end - 0.05));
    if (target >= end - 0.05) {
      if (!v.paused) v.pause(); // hold the last frame at the scene boundary
    } else if (active && v.paused) {
      void v.play().catch(() => {
        // Autoplay with sound refused: fall back to muted playback rather than stopping.
        if (!v.muted) {
          v.muted = true;
          onAudioBlocked?.();
          void v.play().catch(() => {});
        }
      });
    }
  };

  const ready = () => {
    const v = ref.current;
    // Metadata alignment may start a seek. Keep the old layer
    // visible until the same incoming element has a decoded frame at that position.
    if (!v || readyFrame.current !== null) return;
    if (v.requestVideoFrameCallback) {
      // HAVE_CURRENT_DATA alone can precede submission of the decoded frame to the compositor.
      readyFrame.current = v.requestVideoFrameCallback(() => {
        readyFrame.current = null;
        if (!v.seeking && v.readyState >= 2) onReady();
        else ready();
      });
    } else if (!v.seeking && v.readyState >= 2) {
      onReady();
    }
  };

  useEffect(() => {
    const v = ref.current;
    return () => {
      if (readyFrame.current !== null) v?.cancelVideoFrameCallback(readyFrame.current);
      readyFrame.current = null;
    };
  }, [src]);

  // `muted` must be set on the element (React does not update the attribute after mount).
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    v.muted = !(active && audio);
    if (active && audio && !v.paused) {
      void v.play().catch(() => {
        v.muted = true;
        onAudioBlocked?.();
      });
    }
  }, [audio, active, src]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    // Pending media aligns once at metadata load. Do not chase a moving clock with repeated seeks
    // while its first frame is still decoding; normal drift correction resumes on promotion.
    if (active || frozen) align();
  }, [serverNow, active, frozen]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (failed || playbackFailed) onReady();
  }, [failed, playbackFailed]); // eslint-disable-line react-hooks/exhaustive-deps

  if (failed || playbackFailed) return <MediaFallback label="Không tải được đoạn phim" />;
  return (
    <figure className="scene-media" onContextMenu={(e) => e.preventDefault()}>
      {src && (
        <video
          ref={ref}
          className="scene-video"
          src={src}
          muted
          playsInline
          // Released pending media plays muted so even a cached/paused first frame reaches the
          // compositor callback. It is still hidden until ready, and exiting media is frozen.
          autoPlay={!frozen}
          preload="auto"
          disablePictureInPicture
          disableRemotePlayback
          controls={false}
          tabIndex={-1}
          onLoadedMetadata={() => {
            // Subscribe before the paused video's first decoded frame is submitted. Waiting until
            // loadeddata can miss that only frame and leave a paused pending video waiting forever.
            ready();
            align();
          }}
          onLoadedData={ready}
          onCanPlay={ready}
          onSeeked={ready}
          onError={() => setPlaybackFailed(true)}
          data-testid="scene-video"
        />
      )}
      {scene.credit && (
        <figcaption className="scene-caption">
          <span className="scene-credit">{scene.credit}</span>
        </figcaption>
      )}
    </figure>
  );
}
