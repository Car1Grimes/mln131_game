import { useEffect, useState, type FormEvent } from 'react';
import type { AdminView } from '../../shared/protocol';
import { MAX_TEAM_NAME_LENGTH } from '../../shared/protocol';
import { AppHeader } from '../components/AppHeader';
import { Confetti } from '../components/Confetti';
import { Leaderboard } from '../components/Leaderboard';
import { LetterSlots } from '../components/LetterSlots';
import { ConfirmDialog, type ConfirmRequest } from '../components/Modal';
import { Podium } from '../components/Podium';
import { AttributionPanel } from '../components/AttributionPanel';
import { RevealTable } from '../components/RevealTable';
import { RoundTimer } from '../components/RoundTimer';
import { SceneStage } from '../components/SceneStage';
import { QuestionIntro, QuestionPrompt } from '../components/QuestionIntro';
import { api, describeAuthError, storage } from '../net/api';
import { useRoom, useServerNow } from '../net/useRoom';

const TOKEN_KEY = 'hc.admin.token';
const ROOM_KEY = 'hc.admin.room';

const PHASE_TEXT: Record<AdminView['room']['phase'], string> = {
  lobby: 'Phòng chờ',
  intro: 'Đang chuẩn bị câu hỏi',
  active: 'Đang diễn ra',
  revealed: 'Đã công bố kết quả',
  ready: 'Sẵn sàng câu tiếp theo',
  finished: 'Đã kết thúc',
};

export function AdminApp() {
  const [token, setToken] = useState(() => storage.get(TOKEN_KEY));
  const [room, setRoom] = useState(() => storage.get(ROOM_KEY));
  const signOut = () => {
    storage.set(TOKEN_KEY, null);
    storage.set(ROOM_KEY, null);
    setToken(null);
    setRoom(null);
  };
  if (!token) {
    return (
      <AdminLogin
        onLogin={(t) => {
          storage.set(TOKEN_KEY, t);
          setToken(t);
        }}
      />
    );
  }
  if (!room) {
    return (
      <RoomPicker
        token={token}
        onPick={(code) => {
          storage.set(ROOM_KEY, code);
          setRoom(code);
        }}
        onUnauthorized={signOut}
      />
    );
  }
  return (
    <AdminRoom
      token={token}
      roomCode={room}
      onLeaveRoom={() => {
        storage.set(ROOM_KEY, null);
        setRoom(null);
      }}
      onUnauthorized={signOut}
    />
  );
}

function AdminLogin({ onLogin }: { onLogin: (token: string) => void }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      onLogin((await api.adminLogin(password)).token);
    } catch (err) {
      setError(describeAuthError(err));
    }
  };
  return (
    <div className="stage">
      <AppHeader />
      <main className="screen">
        <div className="spotlight" aria-hidden="true" />
        <form className="mp-card" onSubmit={submit}>
          <p className="eyebrow">Quản trò</p>
          <h1 className="screen-title">Đăng nhập</h1>
          <label className="field">
            <span>Mật khẩu quản trò</span>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required data-testid="admin-password" />
          </label>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <button type="submit" className="btn btn-primary btn-lg">
            Đăng nhập
          </button>
        </form>
      </main>
    </div>
  );
}

function RoomPicker({ token, onPick, onUnauthorized }: { token: string; onPick: (code: string) => void; onUnauthorized: () => void }) {
  const [rooms, setRooms] = useState<{ code: string; phase: string; createdAt: number }[]>([]);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api.listRooms(token).then(setRooms, (err) => (err?.status === 401 ? onUnauthorized() : setError(describeAuthError(err))));
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps
  const create = async () => {
    try {
      onPick((await api.createRoom(token)).code);
    } catch (err) {
      setError(describeAuthError(err));
    }
  };
  return (
    <div className="stage">
      <AppHeader />
      <main className="screen">
        <div className="mp-card">
          <p className="eyebrow">Quản trò</p>
          <h1 className="screen-title">Phòng chơi</h1>
          <button type="button" className="btn btn-primary btn-lg" onClick={() => void create()} data-testid="create-room">
            Tạo phòng mới
          </button>
          {error && <p className="form-error">{error}</p>}
          {rooms.length > 0 && (
            <>
              <p className="screen-sub">Hoặc tiếp tục một phòng đã tạo:</p>
              <ul className="mp-room-list">
                {rooms.map((r) => (
                  <li key={r.code}>
                    <button type="button" className="btn btn-ghost" onClick={() => onPick(r.code)}>
                      {r.code} · {PHASE_TEXT[r.phase as AdminView['room']['phase']] ?? r.phase} · {new Date(r.createdAt).toLocaleString('vi-VN')}
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </main>
    </div>
  );
}

function AdminRoom({ token, roomCode, onLeaveRoom, onUnauthorized }: { token: string; roomCode: string; onLeaveRoom: () => void; onUnauthorized: () => void }) {
  const { view, status, offset, emit } = useRoom<AdminView>({ token, roomCode });
  const livePhase = view?.room.phase;
  const serverNow = useServerNow(offset, livePhase === 'active' || livePhase === 'intro', livePhase === 'intro' ? 100 : 200);
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status === 'unauthorized') onUnauthorized();
  }, [status]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!view) {
    return (
      <div className="stage">
        <AppHeader status={status} />
        <main className="screen">
          <p className="screen-sub">Đang tải phòng {roomCode}…</p>
          <button type="button" className="btn btn-ghost" onClick={onLeaveRoom}>
            Chọn phòng khác
          </button>
        </main>
      </div>
    );
  }

  const run = async (event: 'admin:start' | 'admin:advance') => {
    setError(null);
    const r = await emit(event, {});
    if (!r.ok) setError(`Không thực hiện được (${r.error}).`);
  };
  const { phase, questionIndex, totalQuestions } = view.room;
  const nextNumber = questionIndex + 1;
  const joinUrl = `${location.origin}/?room=${view.room.code}`;

  return (
    <div className="stage">
      <AppHeader status={status}>
        <span className="topbar-room">
          Phòng <strong data-testid="room-code">{view.room.code}</strong> · {PHASE_TEXT[phase]}
        </span>
      </AppHeader>
      <main className="screen mp-admin">
        <section className="mp-admin-main">
          {(phase === 'lobby' || phase === 'ready') && (
            <div className="mp-panel mp-center">
              <p className="eyebrow">{phase === 'lobby' ? 'Chuẩn bị' : 'Câu tiếp theo'}</p>
              <h1 className="screen-title">
                Câu {nextNumber}/{totalQuestions}
              </h1>
              <p className="screen-sub">
                {view.teams.filter((t) => t.connected).length}/{view.teams.length} đội đã kết nối · {view.teams.filter((t) => t.ready).length} đội sẵn sàng
              </p>
              <button
                type="button"
                className="btn btn-primary btn-hero"
                data-testid="start-round"
                onClick={() =>
                  setConfirm({
                    title: `Bắt đầu câu ${nextNumber}?`,
                    message: `Tất cả các màn hình chuẩn bị 5 giây, sau đó đồng hồ 40 giây của máy chủ bắt đầu cho tất cả các đội.`,
                    confirmLabel: 'Bắt đầu',
                    onConfirm: () => void run('admin:start'),
                  })
                }
              >
                Bắt đầu câu {nextNumber}
              </button>
              {phase === 'lobby' && (
                <p className="mp-join-hint">
                  Các đội vào <strong>{joinUrl}</strong> và nhập mã phòng cùng mã PIN của đội.
                </p>
              )}
            </div>
          )}

          {phase === 'intro' && view.intro && (
            <div className="mp-panel mp-center">
              <QuestionIntro intro={view.intro} serverNow={serverNow} />
            </div>
          )}

          {phase === 'active' && view.round && (
            <div className="mp-panel">
              <div className="mp-play-head">
                <span className="round-label">
                  Câu <strong>{view.round.questionNumber}</strong>
                  <span className="round-total">/{view.round.totalQuestions}</span>
                </span>
                <QuestionPrompt prompt={view.round.prompt} />
                <div className="mp-timer">
                  <RoundTimer deadlineAt={view.round.deadlineAt} serverNow={serverNow} closed={false} durationMs={view.round.durationMs} />
                </div>
                <div className="mp-submitted" data-testid="submitted-count">
                  <span className="mp-submitted-num">
                    {view.submittedCount}/{view.teams.length}
                  </span>
                  <span>đội đã nộp</span>
                </div>
              </div>
              <SceneStage scenes={view.round.scenes} roundId={view.round.id} token={token} serverNow={serverNow} questionNumber={view.round.questionNumber} />
              <p className="screen-sub">Câu trả lời và kết quả chỉ được công bố khi máy chủ kết thúc câu hỏi.</p>
            </div>
          )}

          {phase === 'revealed' && view.reveal && (
            <div className="mp-panel">
              <p className="eyebrow">Đáp án câu {view.reveal.questionNumber}</p>
              <LetterSlots pattern={view.round?.answerPattern ?? []} answer={view.reveal.canonicalAnswer} size="large" />
              <div className="mp-reveal-grid">
                <RevealTable reveal={view.reveal} />
                <Leaderboard key={view.reveal.roundId} before={view.reveal.standingsBefore} after={view.reveal.standingsAfter} />
              </div>
              <div className="result-actions">
                <AttributionPanel key={view.reveal.roundId} reveal={view.reveal} />
                <button type="button" className="btn btn-primary btn-lg" data-testid="advance" onClick={() => void run('admin:advance')}>
                  {questionIndex + 1 >= totalQuestions ? 'Xem kết quả chung cuộc' : 'Câu tiếp theo'}
                </button>
              </div>
            </div>
          )}

          {phase === 'finished' && (
            <div className="mp-panel mp-center final">
              {view.standings[0] && view.standings[0].score > 0 && <Confetti />}
              <p className="eyebrow">Kết quả chung cuộc</p>
              <Podium standings={view.standings} />
            </div>
          )}
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
        </section>

        <aside className="mp-admin-side">
          <ProjectorPanel view={view} token={token} />
          <TeamsPanel view={view} emit={emit} />
          <section className="mp-panel">
            <h2 className="panel-title">Bảng xếp hạng</h2>
            <ol className="mp-standings" data-testid="standings">
              {view.standings.map((s) => (
                <li key={s.teamId}>
                  <span className="mp-rank">{s.rank}</span>
                  <span className="mp-name">{s.name}</span>
                  <span className="mp-score">{s.score}</span>
                </li>
              ))}
            </ol>
          </section>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onLeaveRoom}>
            Chọn phòng khác
          </button>
        </aside>
      </main>
      {confirm && <ConfirmDialog request={confirm} onClose={() => setConfirm(null)} />}
    </div>
  );
}

function TeamsPanel({ view, emit }: { view: AdminView; emit: ReturnType<typeof useRoom>['emit'] }) {
  const [showPins, setShowPins] = useState(false);
  const [editing, setEditing] = useState<Record<string, string>>({});
  const active = view.room.phase === 'active' || view.room.phase === 'intro';
  const save = async (teamId: string) => {
    const name = editing[teamId];
    if (name === undefined) return;
    const r = await emit('admin:rename', { teamId, name });
    if (r.ok) setEditing(({ [teamId]: _, ...rest }) => rest);
  };
  return (
    <section className="mp-panel">
      <div className="mp-panel-head">
        <h2 className="panel-title">Các đội</h2>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowPins((v) => !v)} aria-pressed={showPins} data-testid="toggle-pins">
          {showPins ? 'Ẩn mã PIN' : 'Hiện mã PIN'}
        </button>
      </div>
      {showPins && <p className="mp-warn">Không chiếu màn hình này khi đang hiện mã PIN.</p>}
      <ul className="mp-teams">
        {view.teams.map((t) => (
          <li key={t.id} className="mp-team" data-testid={`team-${t.slot}`}>
            <div className="mp-team-row">
              <span className="mp-slot">{t.slot}</span>
              {editing[t.id] !== undefined ? (
                <form
                  className="mp-rename"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void save(t.id);
                  }}
                >
                  <input
                    value={editing[t.id]}
                    maxLength={MAX_TEAM_NAME_LENGTH}
                    onChange={(e) => setEditing((m) => ({ ...m, [t.id]: e.target.value }))}
                    aria-label={`Tên đội ${t.slot}`}
                    data-testid={`rename-input-${t.slot}`}
                  />
                  <button type="submit" className="btn btn-sm btn-primary">
                    Lưu
                  </button>
                </form>
              ) : (
                <>
                  <span className="mp-team-name" data-testid={`team-name-${t.slot}`}>
                    {t.name}
                  </span>
                  {!active && (
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing((m) => ({ ...m, [t.id]: t.name }))} data-testid={`rename-${t.slot}`}>
                      Đổi tên
                    </button>
                  )}
                </>
              )}
            </div>
            <div className="mp-team-status">
              <span className={`chip ${t.connected ? 'chip-on' : 'chip-off'}`}>{t.connected ? `Đã kết nối${t.devices > 1 ? ` (${t.devices})` : ''}` : 'Mất kết nối'}</span>
              <span className={`chip ${t.ready ? 'chip-on' : 'chip-off'}`}>{t.ready ? 'Sẵn sàng' : 'Chưa sẵn sàng'}</span>
              {active && <span className={`chip ${t.submitted ? 'chip-gold' : 'chip-off'}`}>{t.submitted ? 'Đã nộp' : 'Chưa nộp'}</span>}
              <span className="mp-pin" data-testid={`pin-${t.slot}`} data-pin={showPins ? t.pin : undefined}>
                PIN: {showPins ? t.pin : '••••••'}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * Projector pairing: issues a one-time link (secret in the URL fragment, never sent in HTTP
 * requests by the browser) that the projector window exchanges for its own read-only session.
 */
function ProjectorPanel({ view, token }: { view: AdminView; token: string }) {
  const [link, setLink] = useState<{ url: string; expiresAt: number } | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null);
  const code = view.room.code;
  const connected = view.projector.connected;

  // A consumed link is useless: hide it once a projector has connected.
  useEffect(() => {
    if (connected > 0) setLink(null);
  }, [connected]);

  const create = async () => {
    setError(null);
    setCopied(false);
    try {
      const r = await api.createScreenPairing(token, code);
      setLink({ url: `${location.origin}/screen#pair=${r.secret}`, expiresAt: r.expiresAt });
    } catch (err) {
      setError(describeAuthError(err));
    }
  };

  const copy = async (input: HTMLInputElement | null) => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link.url);
      setCopied(true);
    } catch {
      // Clipboard API needs a secure context; on http:// LAN addresses fall back to selection copy.
      input?.select();
      setCopied(document.execCommand?.('copy') ?? false);
    }
  };

  let inputRef: HTMLInputElement | null = null;
  return (
    <section className="mp-panel" data-testid="projector-panel">
      <div className="mp-panel-head">
        <h2 className="panel-title">Màn hình máy chiếu</h2>
        <span className={`chip ${connected > 0 ? 'chip-on' : 'chip-off'}`} data-testid="projector-status">
          {connected > 0 ? `Đã kết nối${connected > 1 ? ` (${connected})` : ''}` : 'Chưa kết nối'}
        </span>
      </div>
      <button type="button" className="btn btn-primary btn-sm" onClick={() => void create()} data-testid="projector-create">
        {link ? 'Tạo liên kết mới' : 'Mở màn hình máy chiếu'}
      </button>
      {link && (
        <div className="mp-link">
          <input ref={(el) => (inputRef = el)} readOnly value={link.url} aria-label="Liên kết máy chiếu" data-testid="projector-link" onFocus={(e) => e.target.select()} />
          <div className="mp-link-actions">
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => void copy(inputRef)}>
              {copied ? 'Đã sao chép' : 'Sao chép'}
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => window.open(link.url, '_blank', 'noopener')}>
              Mở cửa sổ máy chiếu
            </button>
          </div>
          <p className="mp-warn">
            Liên kết dùng một lần, hết hạn lúc {new Date(link.expiresAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}. Mở trên máy nối với máy chiếu; không chiếu trang quản trò.
          </p>
        </div>
      )}
      {view.projector.activeSessions > 0 && (
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          data-testid="projector-revoke"
          onClick={() =>
            setConfirm({
              title: 'Thu hồi quyền máy chiếu?',
              message: 'Màn hình máy chiếu sẽ bị ngắt ngay. Cần tạo liên kết mới để kết nối lại.',
              confirmLabel: 'Thu hồi',
              danger: true,
              onConfirm: () => {
                setLink(null);
                api.revokeScreens(token, code).catch((err) => setError(describeAuthError(err)));
              },
            })
          }
        >
          Thu hồi quyền máy chiếu
        </button>
      )}
      {error && <p className="form-error">{error}</p>}
      {confirm && <ConfirmDialog request={confirm} onClose={() => setConfirm(null)} />}
    </section>
  );
}
