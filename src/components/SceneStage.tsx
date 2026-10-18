import { useEffect, useRef, useState } from 'react';
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
  const [shown, setShown] = useState<ReleasedScene | null>(null);
  const [previous, setPrevious] = useState<ReleasedScene | null>(null);
  const [slow, setSlow] = useState(false);

  const pending = latest && latest.id !== shown?.id ? latest : null;

  useEffect(() => {
    setSlow(false);
    if (!pending) return;
    const t = setTimeout(() => setSlow(true), SLOW_LOAD_MS);
    return () => clearTimeout(t);
  }, [pending?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!previous) return;
    const t = setTimeout(() => setPrevious(null), TRANSITION_MS);
    return () => clearTimeout(t);
  }, [previous]);

  const onPendingReady = (scene: ReleasedScene) => {
    setShown((cur) => {
      if (cur && cur.id !== scene.id) setPrevious(cur);
      return scene;
    });
  };

  return (
    <section
      className="scene-stage"
      aria-label={`Câu hỏi ${questionNumber}`}
      data-scene-id={shown?.id ?? ''}
      data-scene-kind={shown?.kind ?? ''}
      data-scene-count={scenes.length}
    >
      {previous && (
        <div className="scene-layer scene-exit" key={`prev-${previous.id}`} aria-hidden="true">
          <SceneContent scene={previous} roundId={roundId} cache={cache} serverNow={serverNow} active={false} />
        </div>
      )}
      {shown && (
        <div className={`scene-layer scene-in scene-t-${shown.transition ?? 'fade'}`} key={`shown-${shown.id}`} aria-live="polite">
          <SceneContent scene={shown} roundId={roundId} cache={cache} serverNow={serverNow} active audio={audio} onAudioBlocked={onAudioBlocked} />
        </div>
      )}
      {pending && (
        <div className="scene-layer scene-pending" key={`pending-${pending.id}`} aria-hidden="true">
          <SceneContent scene={pending} roundId={roundId} cache={cache} serverNow={serverNow} active={false} onReady={() => onPendingReady(pending)} />
        </div>
      )}
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

interface ContentProps {
  scene: ReleasedScene;
  roundId: string;
  cache: MediaCache | null;
  serverNow: number;
  active: boolean;
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
        <div className={`scene-text${scene.body.length > 140 ? ' is-long' : ''}`}>
          {scene.heading && <h3 className="scene-text-heading">{scene.heading}</h3>}
          <p className="scene-text-body">{scene.body}</p>
        </div>
      );
    case 'date':
      return (
        <div className="scene-datecard">
          <span className="scene-date-value">{scene.date}</span>
          {scene.label && <span className="scene-date-label">{scene.label}</span>}
        </div>
      );
    case 'statistic':
      return (
        <div className="scene-stat">
          {scene.demo && <span className="scene-demo-badge">Dữ liệu minh hoạ — không phải số liệu thật</span>}
          <span className="scene-stat-value">
            {scene.value}
            {scene.unit && <span className="scene-stat-unit">{scene.unit}</span>}
          </span>
          <span className="scene-stat-label">{scene.label}</span>
          {scene.source && <span className="scene-stat-source">Nguồn: {scene.source}</span>}
        </div>
      );
    case 'image':
      return <ImageScene {...props} scene={scene} onReady={ready} />;
    case 'video':
      return <VideoScene {...props} scene={scene} onReady={ready} />;
  }
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

function VideoScene({ scene, roundId, cache, serverNow, active, onReady, audio = false, onAudioBlocked }: ContentProps & { scene: Extract<ReleasedScene, { kind: 'video' }>; onReady: () => void }) {
  const { src, failed } = useMedia(cache, mediaPath(roundId, scene.media.assetId));
  const ref = useRef<HTMLVideoElement>(null);

  // Keep the clip aligned with the authoritative timeline (late load, refresh, drift).
  const align = () => {
    const v = ref.current;
    if (!v || !Number.isFinite(v.duration) || v.readyState < 1) return;
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

  useEffect(align, [serverNow, active]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (failed) onReady();
  }, [failed]); // eslint-disable-line react-hooks/exhaustive-deps

  if (failed) return <MediaFallback label="Không tải được đoạn phim" />;
  return (
    <figure className="scene-media" onContextMenu={(e) => e.preventDefault()}>
      {src && (
        <video
          ref={ref}
          className="scene-video"
          src={src}
          muted
          playsInline
          autoPlay={active}
          preload="auto"
          disablePictureInPicture
          disableRemotePlayback
          controls={false}
          tabIndex={-1}
          onLoadedMetadata={align}
          onCanPlay={() => {
            align();
            onReady();
          }}
          onError={onReady}
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
