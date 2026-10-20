import { useEffect, useRef, useState } from 'react';
import type { ScreenView } from '../../shared/protocol';
import { tiedLeaders } from '../../shared/scoring';
import { AppHeader } from '../components/AppHeader';
import { Confetti } from '../components/Confetti';
import { Leaderboard } from '../components/Leaderboard';
import { LetterSlots } from '../components/LetterSlots';
import { Podium, RestOfStandings } from '../components/Podium';
import { AttributionPanel } from '../components/AttributionPanel';
import { RevealTable } from '../components/RevealTable';
import { RoundTimer } from '../components/RoundTimer';
import { SceneStage } from '../components/SceneStage';
import { FullscreenIcon } from '../components/icons';
import { api, storage } from '../net/api';
import { useRoom, useServerNow } from '../net/useRoom';

const TOKEN_KEY = 'hc.screen.token';

/**
 * Read-only projector display. Paired by a one-time link from /admin (`/screen#pair=<secret>`);
 * the secret is removed from the URL immediately and exchanged for a dedicated, expiring,
 * room-scoped 'screen' session. The display never shows the token or any PIN.
 */
export function ScreenApp() {
  const [token, setToken] = useState(() => storage.get(TOKEN_KEY));
  const [pairing, setPairing] = useState<'idle' | 'pairing' | 'failed'>('idle');
  const [ended, setEnded] = useState(false);
  const seen = useRef(new Set<string>());

  // Pair on load and whenever a new link is opened in this same tab (only the #fragment changes,
  // so the page does not reload). Each secret is tried once.
  useEffect(() => {
    const tryPair = () => {
      const match = location.hash.match(/(?:^#|&)pair=([\w-]+)/);
      if (!match || seen.current.has(match[1]!)) return;
      seen.current.add(match[1]!);
      // Remove the one-time secret from the address bar and history before using it.
      history.replaceState(null, '', location.pathname);
      setPairing('pairing');
      api.screenPair(match[1]!).then(
        (r) => {
          storage.set(TOKEN_KEY, r.token);
          setToken(r.token);
          setEnded(false);
          setPairing('idle');
        },
        () => setPairing('failed'),
      );
    };
    tryPair();
    window.addEventListener('hashchange', tryPair);
    return () => window.removeEventListener('hashchange', tryPair);
  }, []);

  if (!token) return <Unpaired pairing={pairing} ended={ended} />;
  return (
    <ScreenRoom
      token={token}
      onInvalid={() => {
        storage.set(TOKEN_KEY, null);
        setToken(null);
        setEnded(true);
      }}
    />
  );
}

function Unpaired({ pairing, ended }: { pairing: 'idle' | 'pairing' | 'failed'; ended: boolean }) {
  return (
    <div className="stage screen-app">
      <AppHeader />
      <main className="screen">
        <div className="spotlight" aria-hidden="true" />
        <div className="mp-card screen-unpaired" data-testid="screen-unpaired">
          <p className="eyebrow">Màn hình máy chiếu</p>
          {pairing === 'pairing' ? (
            <p className="screen-sub">Đang kết nối…</p>
          ) : (
            <>
              <p className="screen-sub" role="status">
                {pairing === 'failed'
                  ? 'Liên kết ghép nối không hợp lệ, đã dùng hoặc đã hết hạn.'
                  : ended
                    ? 'Phiên máy chiếu đã hết hạn hoặc đã bị thu hồi.'
                    : 'Màn hình chưa được kết nối.'}
              </p>
              <p className="screen-sub">Trên trang quản trò, chọn “Tạo liên kết máy chiếu” rồi mở liên kết đó trên máy nối với máy chiếu.</p>
            </>
          )}
        </div>
      </main>
    </div>
  );
}

function useFullscreen() {
  const [active, setActive] = useState(() => !!document.fullscreenElement);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const on = () => setActive(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', on);
    return () => document.removeEventListener('fullscreenchange', on);
  }, []);
  // Only ever called from a click handler (the Fullscreen API requires user activation).
  const toggle = () => {
    setFailed(false);
    const request = document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.();
    void request?.catch(() => setFailed(true));
  };
  return { active, failed, toggle, supported: !!document.documentElement.requestFullscreen };
}

function ScreenRoom({ token, onInvalid }: { token: string; onInvalid: () => void }) {
  const { view, status, offset } = useRoom<ScreenView>({ token });
  const serverNow = useServerNow(offset, view?.room.phase === 'active');
  const fullscreen = useFullscreen();
  const [audio, setAudio] = useState(false);
  const [audioBlocked, setAudioBlocked] = useState(false);

  useEffect(() => {
    if (status === 'unauthorized') onInvalid();
  }, [status]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="stage screen-app" data-phase={view?.room.phase ?? 'loading'}>
      <AppHeader status={status}>
        {view && (
          <span className="topbar-room">
            Phòng <strong data-testid="screen-room-code">{view.room.code}</strong>
          </span>
        )}
      </AppHeader>
      <div className="screen-controls">
        <button
          type="button"
          className={`btn btn-sm ${audio ? 'btn-primary' : 'btn-ghost'}`}
          aria-pressed={audio}
          onClick={() => {
            setAudioBlocked(false);
            setAudio((a) => !a);
          }}
          data-testid="screen-audio"
        >
          {audio ? 'Tắt âm thanh' : 'Bật âm thanh'}
        </button>
        {fullscreen.supported && (
          <button type="button" className="btn btn-sm btn-primary" onClick={fullscreen.toggle} aria-pressed={fullscreen.active} data-testid="screen-fullscreen">
            <FullscreenIcon /> {fullscreen.active ? 'Thoát toàn màn hình' : 'Toàn màn hình'}
          </button>
        )}
      </div>
      {audioBlocked && (
        <p className="screen-notice" role="status">
          Trình duyệt chặn phát âm thanh tự động — video tiếp tục ở chế độ tắt tiếng.
        </p>
      )}
      {fullscreen.failed && (
        <p className="screen-notice" role="status">
          Không thể bật toàn màn hình. Hãy dùng phím F11 hoặc menu của trình duyệt.
        </p>
      )}
      {!view ? (
        <main className="screen">
          <p className="screen-sub">Đang tải…</p>
        </main>
      ) : view.room.phase === 'active' && view.round ? (
        <ScreenPlay
          view={view}
          token={token}
          serverNow={serverNow}
          audio={audio}
          onAudioBlocked={() => {
            setAudio(false);
            setAudioBlocked(true);
          }}
        />
      ) : view.room.phase === 'revealed' && view.reveal ? (
        <ScreenReveal view={view} />
      ) : view.room.phase === 'finished' ? (
        <ScreenFinal view={view} />
      ) : (
        <ScreenLobby view={view} />
      )}
    </div>
  );
}

function ScreenLobby({ view }: { view: ScreenView }) {
  const next = view.room.questionIndex + 1;
  const lobby = view.room.phase === 'lobby';
  return (
    <main className="screen screen-lobby" data-testid="screen-lobby">
      <div className="spotlight" aria-hidden="true" />
      {lobby ? (
        <h1 className="hero-title">
          <span>THE HIDDEN</span>
          <span className="hero-accent">CONNECTION</span>
        </h1>
      ) : (
        <h1 className="screen-title">
          Câu tiếp theo: {next}/{view.room.totalQuestions}
        </h1>
      )}
      {lobby && (
        <p className="screen-join">
          Mã phòng <strong>{view.room.code}</strong> · {location.origin}/?room={view.room.code}
        </p>
      )}
      <ul className="screen-teams">
        {view.teams.map((t) => (
          <li key={t.id} className={t.connected ? 'is-on' : ''}>
            <span className="screen-team-name">{t.name}</span>
            <span className={`chip ${t.connected ? 'chip-on' : 'chip-off'}`}>{t.connected ? 'Đã vào phòng' : 'Chưa vào'}</span>
            <span className={`chip ${t.ready ? 'chip-on' : 'chip-off'}`}>{t.ready ? 'Sẵn sàng' : 'Chưa sẵn sàng'}</span>
          </li>
        ))}
      </ul>
      {!lobby && view.standings.some((s) => s.score > 0) && (
        <ul className="standings-strip" aria-label="Bảng điểm">
          {view.standings.map((s) => (
            <li key={s.teamId}>
              <span className="strip-name">
                {s.rank}. {s.name}
              </span>
              <span className="strip-score">{s.score}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="screen-sub screen-waiting" data-testid="screen-waiting">
        Đang chờ quản trò bắt đầu
      </p>
    </main>
  );
}

function ScreenPlay({
  view,
  token,
  serverNow,
  audio,
  onAudioBlocked,
}: {
  view: ScreenView;
  token: string;
  serverNow: number;
  audio: boolean;
  onAudioBlocked: () => void;
}) {
  const round = view.round!;
  return (
    <main className="screen screen-play" data-testid="screen-play">
      <section className="screen-play-main">
        <SceneStage
          scenes={round.scenes}
          roundId={round.id}
          token={token}
          serverNow={serverNow}
          questionNumber={round.questionNumber}
          audio={audio}
          onAudioBlocked={onAudioBlocked}
        />
        <LetterSlots pattern={round.answerPattern} />
      </section>
      <aside className="screen-play-side">
        <span className="round-label">
          Câu <strong>{round.questionNumber}</strong>
          <span className="round-total">/{round.totalQuestions}</span>
        </span>
        <div className="screen-timer">
          <RoundTimer deadlineAt={round.deadlineAt} serverNow={serverNow} closed={false} durationMs={round.durationMs} />
        </div>
        <div className="mp-submitted" data-testid="screen-submitted">
          <span className="mp-submitted-num">
            {view.submittedCount}/{view.teams.length}
          </span>
          <span>đội đã nộp</span>
        </div>
        {/* Team names only: which team has submitted is never shown here (that would reveal the order). */}
        <ul className="screen-team-status" aria-label="Các đội">
          {view.teams.map((t) => (
            <li key={t.id}>
              <span className="screen-team-name">{t.name}</span>
              <span className={`conn-dot screen-team-dot${t.connected ? ' is-on' : ''}`} aria-label={t.connected ? 'Đã kết nối' : 'Mất kết nối'} />
            </li>
          ))}
        </ul>
      </aside>
    </main>
  );
}

function ScreenReveal({ view }: { view: ScreenView }) {
  const reveal = view.reveal!;
  return (
    <main className="screen mp-reveal screen-reveal" data-testid="screen-reveal">
      <p className="eyebrow">Đáp án câu {reveal.questionNumber}</p>
      <LetterSlots pattern={view.round?.answerPattern ?? []} answer={reveal.canonicalAnswer} size="large" />
      <AttributionPanel key={reveal.roundId} reveal={reveal} />
      <div className="mp-reveal-grid">
        <RevealTable reveal={reveal} />
        <Leaderboard key={reveal.roundId} before={reveal.standingsBefore} after={reveal.standingsAfter} />
      </div>
    </main>
  );
}

function ScreenFinal({ view }: { view: ScreenView }) {
  const leaders = view.standings.filter((s) => s.rank === 1 && s.score > 0);
  const tied = tiedLeaders(view.standings);
  return (
    <main className="screen final screen-final" data-testid="screen-final">
      {leaders.length > 0 && <Confetti />}
      <div className="spotlight spotlight-gold" aria-hidden="true" />
      <p className="eyebrow">Kết quả chung cuộc</p>
      <h1 className="final-title" data-testid="screen-final-title">
        {leaders.length === 0 ? (
          'Chưa có đội nào ghi điểm'
        ) : tied.length > 1 ? (
          <>
            Đồng hạng nhất: <span className="gold">{tied.map((t) => t.name).join(' & ')}</span>
          </>
        ) : (
          <>
            Chúc mừng <span className="gold">{leaders[0]!.name}</span>!
          </>
        )}
      </h1>
      <Podium standings={view.standings} />
      <RestOfStandings standings={view.standings} />
    </main>
  );
}
