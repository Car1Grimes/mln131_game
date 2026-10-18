import { useEffect, useState, type FormEvent } from 'react';
import type { TeamView } from '../../shared/protocol';
import { MAX_ANSWER_LENGTH } from '../../shared/protocol';
import { AppHeader } from '../components/AppHeader';
import { Confetti } from '../components/Confetti';
import { Leaderboard } from '../components/Leaderboard';
import { LetterSlots } from '../components/LetterSlots';
import { ConfirmDialog, type ConfirmRequest } from '../components/Modal';
import { Podium } from '../components/Podium';
import { RevealTable } from '../components/RevealTable';
import { RoundTimer } from '../components/RoundTimer';
import { SceneStage } from '../components/SceneStage';
import { api, describeAuthError, storage } from '../net/api';
import { useRoom, useServerNow } from '../net/useRoom';

const TOKEN_KEY = 'hc.team.token';

export function PlayerApp() {
  const [token, setToken] = useState(() => storage.get(TOKEN_KEY));
  if (!token) {
    return (
      <JoinScreen
        onJoined={(t) => {
          storage.set(TOKEN_KEY, t);
          setToken(t);
        }}
      />
    );
  }
  return (
    <PlayerRoom
      token={token}
      onLeave={() => {
        storage.set(TOKEN_KEY, null);
        setToken(null);
      }}
    />
  );
}

function JoinScreen({ onJoined }: { onJoined: (token: string) => void }) {
  const [code, setCode] = useState(() => new URLSearchParams(location.search).get('room')?.toUpperCase() ?? '');
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await api.join(code.trim(), pin.trim());
      onJoined(r.token);
    } catch (err) {
      setError(describeAuthError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="stage">
      <AppHeader />
      <main className="screen">
        <div className="spotlight" aria-hidden="true" />
        <form className="mp-card" onSubmit={submit}>
          <p className="eyebrow">Đội chơi</p>
          <h1 className="screen-title">Tham gia phòng</h1>
          <label className="field">
            <span>Mã phòng</span>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              maxLength={8}
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              required
              data-testid="join-code"
            />
          </label>
          <label className="field">
            <span>Mã PIN của đội</span>
            <input
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
              inputMode="numeric"
              maxLength={6}
              autoComplete="off"
              required
              data-testid="join-pin"
            />
          </label>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <button type="submit" className="btn btn-primary btn-lg" disabled={busy || code.length < 4 || pin.length !== 6}>
            Vào phòng
          </button>
        </form>
      </main>
    </div>
  );
}

function PlayerRoom({ token, onLeave }: { token: string; onLeave: () => void }) {
  const { view, status, offset, emit } = useRoom<TeamView>({ token });
  const active = view?.room.phase === 'active';
  const serverNow = useServerNow(offset, active);

  if (status === 'unauthorized') {
    return (
      <div className="stage">
        <AppHeader status={status} />
        <main className="screen">
          <div className="mp-card">
            <p>Phiên tham gia không còn hợp lệ. Vui lòng tham gia lại bằng mã phòng và mã PIN.</p>
            <button type="button" className="btn btn-primary" onClick={onLeave}>
              Tham gia lại
            </button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="stage">
      <AppHeader status={status}>
        {view && (
          <span className="topbar-team" data-testid="team-name">
            {view.me.name} · Phòng {view.room.code}
          </span>
        )}
      </AppHeader>
      {!view ? (
        <main className="screen">
          <p className="screen-sub">Đang tải…</p>
        </main>
      ) : view.room.phase === 'active' && view.round ? (
        <PlayScreen view={view} serverNow={serverNow} emit={emit} />
      ) : view.room.phase === 'revealed' && view.reveal ? (
        <RevealScreen view={view} />
      ) : view.room.phase === 'finished' ? (
        <FinalScreen view={view} />
      ) : (
        <WaitingScreen view={view} onReady={(ready) => void emit('team:ready', { ready })} />
      )}
    </div>
  );
}

function WaitingScreen({ view, onReady }: { view: TeamView; onReady: (ready: boolean) => void }) {
  const next = view.room.questionIndex + 1;
  return (
    <main className="screen mp-waiting">
      <div className="spotlight" aria-hidden="true" />
      <p className="eyebrow">{view.room.phase === 'lobby' ? 'Phòng chờ' : `Chuẩn bị câu ${next}/${view.room.totalQuestions}`}</p>
      <h1 className="screen-title">{view.me.name}</h1>
      <p className="screen-sub" data-testid="waiting-text">
        Đang chờ quản trò bắt đầu{view.room.phase === 'lobby' ? ' trò chơi' : ` câu ${next}`}…
      </p>
      <button
        type="button"
        className={`btn btn-lg ${view.me.ready ? 'btn-ghost' : 'btn-primary'}`}
        onClick={() => onReady(!view.me.ready)}
        aria-pressed={view.me.ready}
        data-testid="ready-button"
      >
        {view.me.ready ? '✓ Đội đã sẵn sàng' : 'Xác nhận sẵn sàng'}
      </button>
      {view.standings.some((s) => s.score > 0) && <StandingsStrip view={view} />}
    </main>
  );
}

function StandingsStrip({ view }: { view: TeamView }) {
  return (
    <ul className="standings-strip" aria-label="Bảng điểm">
      {view.standings.map((s) => (
        <li key={s.teamId} className={s.teamId === view.me.id ? 'is-me' : ''}>
          <span className="strip-name">
            {s.rank}. {s.name}
          </span>
          <span className="strip-score">{s.score}</span>
        </li>
      ))}
    </ul>
  );
}

function PlayScreen({ view, serverNow, emit }: { view: TeamView; serverNow: number; emit: ReturnType<typeof useRoom>['emit'] }) {
  const round = view.round!;
  const [answer, setAnswer] = useState('');
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const timeUp = serverNow >= round.deadlineAt;
  const submission = view.me.submission;

  // One submission id per round, kept across refreshes: retries are idempotent on the server.
  const submissionId = () => {
    const key = `hc.sub.${round.id}`;
    let id = storage.get(key);
    if (!id) {
      id = crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}-sub`;
      storage.set(key, id);
    }
    return id;
  };

  useEffect(() => setError(null), [round.id]);

  const send = async (text: string) => {
    setSending(true);
    setError(null);
    const r = await emit<{ receivedAt: number }>('team:submit', { submissionId: submissionId(), answer: text });
    setSending(false);
    if (!r.ok) {
      setError(
        r.error === 'round_closed'
          ? 'Đã hết giờ — câu trả lời không được ghi nhận.'
          : r.error === 'already_submitted'
            ? 'Đội đã nộp câu trả lời cho câu này.'
            : r.error === 'offline'
              ? 'Mất kết nối. Hãy thử gửi lại — câu trả lời chỉ được ghi nhận một lần.'
              : 'Không gửi được câu trả lời.',
      );
    }
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const text = answer.trim();
    if (!text) return;
    setConfirm({
      title: 'Gửi câu trả lời?',
      message: `“${text}” — mỗi đội chỉ được gửi một lần và không thể sửa sau khi gửi.`,
      confirmLabel: 'Gửi',
      onConfirm: () => void send(text),
    });
  };

  return (
    <main className="screen mp-play">
      <div className="mp-play-head">
        <span className="round-label">
          Câu <strong>{round.questionNumber}</strong>
          <span className="round-total">/{round.totalQuestions}</span>
        </span>
        <div className="mp-timer">
          <RoundTimer deadlineAt={round.deadlineAt} serverNow={serverNow} closed={false} durationMs={round.durationMs} />
        </div>
      </div>
      <SceneStage scenes={round.scenes} questionNumber={round.questionNumber} />
      <LetterSlots pattern={round.answerPattern} />
      {submission ? (
        <div className="mp-ack" role="status" data-testid="submitted-ack">
          <strong>Đã ghi nhận câu trả lời của đội.</strong>
          <span>
            “{submission.answer}” · lúc {((submission.receivedAt - round.startedAt) / 1000).toFixed(1).replace('.', ',')} giây
          </span>
          <span className="mp-ack-note">Kết quả sẽ được công bố khi hết giờ.</span>
        </div>
      ) : (
        <form className="mp-answer" onSubmit={onSubmit}>
          <input
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            placeholder={timeUp ? 'Đã hết giờ' : 'Nhập câu trả lời của đội…'}
            maxLength={MAX_ANSWER_LENGTH}
            disabled={timeUp || sending}
            autoComplete="off"
            spellCheck={false}
            aria-label="Câu trả lời"
            data-testid="answer-input"
          />
          <button type="submit" className="btn btn-primary btn-lg" disabled={timeUp || sending || !answer.trim()} data-testid="answer-submit">
            Gửi đáp án
          </button>
        </form>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {confirm && <ConfirmDialog request={confirm} onClose={() => setConfirm(null)} />}
    </main>
  );
}

function RevealScreen({ view }: { view: TeamView }) {
  const reveal = view.reveal!;
  const mine = reveal.submissions.find((s) => s.teamId === view.me.id);
  return (
    <main className="screen mp-reveal">
      <p className="eyebrow">Đáp án câu {reveal.questionNumber}</p>
      <LetterSlots pattern={view.round?.answerPattern ?? []} answer={reveal.canonicalAnswer} size="large" />
      <div className={`result-card ${mine?.correct ? 'is-correct' : ''}`} data-testid="my-result">
        {!mine || mine.answer === null ? (
          <span className="result-team">Đội chưa nộp câu trả lời</span>
        ) : mine.correct ? (
          <>
            <span className="result-team">Chính xác!</span>
            <span className="result-points">+{mine.points}</span>
            <span className="result-detail">Đội trả lời đúng thứ {mine.orderRank}</span>
          </>
        ) : (
          <span className="result-team">Chưa chính xác · 0 điểm</span>
        )}
      </div>
      <div className="mp-reveal-grid">
        <RevealTable reveal={reveal} highlightTeamId={view.me.id} />
        <Leaderboard key={reveal.roundId} before={reveal.standingsBefore} after={reveal.standingsAfter} />
      </div>
      <p className="screen-sub">Chờ quản trò chuyển sang câu tiếp theo…</p>
    </main>
  );
}

function FinalScreen({ view }: { view: TeamView }) {
  const me = view.standings.find((s) => s.teamId === view.me.id);
  return (
    <main className="screen final">
      {view.standings[0] && view.standings[0].score > 0 && <Confetti />}
      <div className="spotlight spotlight-gold" aria-hidden="true" />
      <p className="eyebrow">Kết quả chung cuộc</p>
      {me && (
        <h1 className="final-title">
          {view.me.name}: hạng <span className="gold">{me.rank}</span> · {me.score} điểm
        </h1>
      )}
      <Podium standings={view.standings} />
    </main>
  );
}
