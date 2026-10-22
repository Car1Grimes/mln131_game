import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { TeamView } from '../../shared/protocol';
import { MAX_ANSWER_LENGTH } from '../../shared/protocol';
import { AppHeader } from '../components/AppHeader';
import { Confetti } from '../components/Confetti';
import { Leaderboard } from '../components/Leaderboard';
import { LetterSlots } from '../components/LetterSlots';
import { ConfirmDialog, type ConfirmRequest } from '../components/Modal';
import { Podium, RestOfStandings } from '../components/Podium';
import { AttributionPanel } from '../components/AttributionPanel';
import { RevealTable } from '../components/RevealTable';
import { RoundTimer } from '../components/RoundTimer';
import { SceneStage } from '../components/SceneStage';
import { QuestionIntro, QuestionPrompt } from '../components/QuestionIntro';
import { api, describeAuthError, storage } from '../net/api';
import { useRoom, useServerNow } from '../net/useRoom';
import { afterAck, canEditAnswer, deliveryView, parsePending, restoreState, retryDelayMs, startSending, type DeliveryState, type PendingSubmission } from './delivery';

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
  const phase = view?.room.phase;
  const serverNow = useServerNow(offset, phase === 'active' || phase === 'intro', phase === 'intro' ? 100 : 200);

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
            <span className="topbar-team-name">{view.me.name}</span>
            <span className="topbar-team-room"> · Phòng {view.room.code}</span>
          </span>
        )}
      </AppHeader>
      {!view ? (
        <main className="screen">
          <p className="screen-sub">Đang tải…</p>
        </main>
      ) : view.room.phase === 'intro' && view.intro ? (
        <main className="screen qintro-screen">
          <div className="spotlight" aria-hidden="true" />
          <QuestionIntro intro={view.intro} serverNow={serverNow} />
        </main>
      ) : view.room.phase === 'active' && view.round ? (
        <PlayScreen key={view.round.id} view={view} serverNow={serverNow} emit={emit} token={token} connected={status === 'connected'} />
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

function PlayScreen({
  view,
  serverNow,
  emit,
  token,
  connected,
}: {
  view: TeamView;
  serverNow: number;
  emit: ReturnType<typeof useRoom>['emit'];
  token: string;
  connected: boolean;
}) {
  const round = view.round!;
  const pendingKey = `hc.pending.${round.id}`;
  const [answer, setAnswer] = useState('');
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null);
  // Restores a locked, unconfirmed answer after a refresh (it is retried with the same id).
  const [delivery, setDelivery] = useState<DeliveryState>(() => restoreState(parsePending(storage.get(pendingKey), round.id)));
  const inFlight = useRef(false);
  const timeUp = serverNow >= round.deadlineAt; // display hint only; the server decides
  const submission = view.me.submission;
  const recorded = submission !== null;

  const send = async (pending: PendingSubmission) => {
    if (inFlight.current) return;
    inFlight.current = true;
    const attempts = delivery.status === 'uncertain' ? delivery.attempts : 0;
    setDelivery(startSending(pending, attempts));
    const ack = await emit<{ receivedAt: number; duplicate: boolean }>('team:submit', pending);
    inFlight.current = false;
    setDelivery((cur) => {
      const next = afterAck(cur.status === 'sending' ? cur : startSending(pending, attempts), ack);
      if (next.status === 'rejected') storage.set(pendingKey, null);
      return next;
    });
  };

  // The server has the submission: nothing is pending any more.
  useEffect(() => {
    if (recorded) storage.set(pendingKey, null);
  }, [recorded, pendingKey]);

  // Automatic retry of an unconfirmed submission while connected (same id: idempotent server-side).
  useEffect(() => {
    if (recorded || !connected || delivery.status !== 'uncertain') return;
    if (delivery.pending.roundId !== round.id) return; // belongs to another round: never sent here
    const delay = delivery.attempts === 0 ? 0 : (retryDelayMs(delivery) ?? 2_000);
    const timer = setTimeout(() => void send(delivery.pending), delay);
    return () => clearTimeout(timer);
  }, [delivery, connected, recorded]); // eslint-disable-line react-hooks/exhaustive-deps

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const text = answer.trim();
    if (!text) return;
    setConfirm({
      title: 'Gửi câu trả lời?',
      message: `“${text}” — mỗi đội chỉ được gửi một lần và không thể sửa sau khi gửi.`,
      confirmLabel: 'Gửi',
      onConfirm: () => {
        const pending: PendingSubmission = {
          roundId: round.id,
          submissionId: crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}-sub`,
          answer: text,
        };
        // Persist before sending: a refresh or crash mid-send resumes the *same* submission.
        storage.set(pendingKey, JSON.stringify(pending));
        void send(pending);
      },
    });
  };

  return (
    <main className="screen mp-play">
      <div className="mp-play-head">
        <span className="round-label">
          Câu <strong>{round.questionNumber}</strong>
          <span className="round-total">/{round.totalQuestions}</span>
        </span>
        <QuestionPrompt prompt={round.prompt} />
        <div className="mp-timer">
          <RoundTimer deadlineAt={round.deadlineAt} serverNow={serverNow} closed={false} durationMs={round.durationMs} />
        </div>
      </div>
      <SceneStage scenes={round.scenes} roundId={round.id} token={token} serverNow={serverNow} questionNumber={round.questionNumber} />
      <LetterSlots pattern={round.answerPattern} />
      {submission ? (
        <div className="mp-ack" role="status" data-testid="submitted-ack">
          <strong>Đã ghi nhận câu trả lời của đội.</strong>
          <span>
            “{submission.answer}” · lúc {((submission.receivedAt - round.startedAt) / 1000).toFixed(1).replace('.', ',')} giây
          </span>
          <span className="mp-ack-note">Kết quả sẽ được công bố khi hết giờ.</span>
        </div>
      ) : canEditAnswer(delivery, recorded) ? (
        <form className="mp-answer" onSubmit={onSubmit}>
          <input
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            placeholder={timeUp ? 'Đã hết giờ' : 'Nhập câu trả lời của đội…'}
            maxLength={MAX_ANSWER_LENGTH}
            disabled={timeUp}
            autoComplete="off"
            spellCheck={false}
            aria-label="Câu trả lời"
            data-testid="answer-input"
          />
          <button type="submit" className="btn btn-primary btn-lg" disabled={timeUp || !answer.trim()} data-testid="answer-submit">
            Gửi đáp án
          </button>
        </form>
      ) : (
        <DeliveryStatus delivery={delivery} connected={connected} />
      )}
      {delivery.status === 'rejected' && delivery.reason === 'invalid' && (
        <p className="form-error" role="alert">
          Câu trả lời không hợp lệ. Hãy nhập lại.
        </p>
      )}
      {confirm && <ConfirmDialog request={confirm} onClose={() => setConfirm(null)} />}
    </main>
  );
}

/** Delivery state of an answer that the server has not (yet) confirmed. Never claims "recorded". */
function DeliveryStatus({ delivery, connected }: { delivery: DeliveryState; connected: boolean }) {
  const view = deliveryView(delivery);
  if (view === null || delivery.status === 'idle') return null;
  if (delivery.status === 'rejected') {
    return (
      <div className="mp-ack mp-ack-warn" role="alert" data-testid="delivery-rejected">
        <strong>Đã hết giờ — câu trả lời không được ghi nhận.</strong>
      </div>
    );
  }
  const text = `“${delivery.pending.answer}”`;
  return (
    <div className={`mp-ack${view === 'uncertain' ? ' mp-ack-warn' : ''}`} role="status" data-testid={`delivery-${view}`}>
      {view === 'sending' && <strong>Đang gửi {text}…</strong>}
      {view === 'accepted' && <strong>Máy chủ đã nhận {text}. Đang đồng bộ…</strong>}
      {view === 'uncertain' && (
        <>
          <strong>Chưa xác nhận được câu trả lời {text}.</strong>
          <span>{connected ? 'Đang gửi lại…' : 'Mất kết nối — sẽ tự động gửi lại khi có mạng.'}</span>
          <span className="mp-ack-note">Không cần gửi đáp án khác: câu trả lời này chỉ được ghi nhận một lần.</span>
        </>
      )}
    </div>
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
      <AttributionPanel key={reveal.roundId} reveal={reveal} />
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
          {view.me.name}:{' '}
          <span className="nowrap">
            hạng <span className="gold">{me.rank}</span> ·
          </span>{' '}
          <span className="nowrap">{me.score} điểm</span>
        </h1>
      )}
      <Podium standings={view.standings} />
      <RestOfStandings standings={view.standings} />
    </main>
  );
}
