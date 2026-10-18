import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnswerDialog } from './components/AnswerDialog';
import { FeedbackLayer } from './components/FeedbackLayer';
import { ImageCreditsDialog } from './components/ImageCreditsDialog';
import { ConfirmDialog, type ConfirmRequest } from './components/Modal';
import { TeamNamesDialog } from './components/TeamNamesDialog';
import { TopBar } from './components/TopBar';
import { allQuestionsComplete, getElapsedMs, getIneligible, getScores, teamName } from './game/machine';
import { cluesRevealedAt, remainingMs } from './game/rules';
import { computeStandings } from './game/standings';
import { useGame } from './hooks/useGame';
import { FinalScreen } from './screens/FinalScreen';
import { PlayScreen } from './screens/PlayScreen';
import { RoundIntroScreen } from './screens/RoundIntroScreen';
import { RoundResultScreen } from './screens/RoundResultScreen';
import { SetupScreen } from './screens/SetupScreen';
import { WelcomeScreen } from './screens/WelcomeScreen';
import { isTypingTarget, pauseAvailability } from './ui/interaction';

function toggleFullscreen() {
  if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
  else void document.documentElement.requestFullscreen?.().catch(() => {});
}

export function App() {
  const { state, now, act, questions } = useGame();
  // View-only state. All game data lives in the state machine.
  const [welcome, setWelcome] = useState(true);
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [showCredits, setShowCredits] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);

  const question = questions[state.questionIndex]!;
  const total = questions.length;
  const names = useMemo(
    () => Object.fromEntries(state.teams.map((t) => [t.id, teamName(state, t.id)])),
    [state],
  );
  const describeTeam = useCallback((id: string) => names[id] ?? id, [names]);
  const scores = getScores(state);
  const elapsed = getElapsedMs(state, now);
  const pause = pauseAvailability(state, now);
  const inRound = state.phase === 'running' || state.phase === 'paused_for_answer';
  const modalOpen = state.phase === 'paused_for_answer' || confirm !== null || renaming || (showCredits && state.phase === 'final');

  // Everything behind an open modal is inert (not clickable, not focusable).
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    if (modalOpen) el.setAttribute('inert', '');
    else el.removeAttribute('inert');
  }, [modalOpen]);

  const doPause = useCallback(() => act({ type: 'PAUSE', now: 0 }), [act]);

  // Shortcuts: P = pause & answer, F = fullscreen. Ignored while typing or when a dialog is open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      if (isTypingTarget(e.target) || modalOpen) return;
      const key = e.key.toLowerCase();
      if (key === 'p' && pauseAvailability(state, performance.now()) === 'available') {
        e.preventDefault();
        doPause();
      } else if (key === 'f') {
        e.preventDefault();
        toggleFullscreen();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [state, modalOpen, doPause]);

  const goToQuestion = (index: number) => {
    if (index === state.questionIndex && state.phase !== 'final') return;
    const done = state.results[index] !== null;
    setConfirm({
      title: `Chuyển sang câu ${index + 1}?`,
      message: inRound
        ? `Câu ${state.questionIndex + 1} đang diễn ra. Đồng hồ vẫn chạy trong lúc bạn xác nhận; nếu chuyển, thời gian và lượt trả lời sai của câu này sẽ bị hủy (điểm đã cộng được giữ nguyên).`
        : done
          ? `Câu ${index + 1} đã kết thúc và sẽ mở ở chế độ xem lại đáp án.`
          : `Câu ${index + 1} sẽ được mở, sẵn sàng để bắt đầu.`,
      confirmLabel: `Chuyển sang câu ${index + 1}`,
      danger: inRound,
      onConfirm: () => act({ type: 'GO_TO_QUESTION', index }),
    });
  };

  const showFinal = () =>
    setConfirm({
      title: 'Xem kết quả chung cuộc?',
      message: allQuestionsComplete(state)
        ? 'Tất cả câu hỏi đã kết thúc.'
        : 'Vẫn còn câu hỏi chưa chơi. Bạn có thể quay lại các câu đó từ thanh trên cùng.',
      confirmLabel: 'Xem kết quả',
      onConfirm: () => act({ type: 'SHOW_FINAL' }),
    });

  const reset = () =>
    setConfirm({
      title: 'Chơi lại từ đầu?',
      message: 'Toàn bộ điểm số và kết quả các câu sẽ bị xóa. Tên các đội được giữ nguyên.',
      confirmLabel: 'Chơi lại',
      danger: true,
      onConfirm: () => {
        act({ type: 'RESET' });
        setWelcome(true);
      },
    });

  const undo = () => {
    const entry = state.history[state.history.length - 1];
    if (!entry) return;
    setConfirm({
      title: 'Hoàn tác lần chấm gần nhất?',
      message: `Hoàn tác “${entry.label}”. Trò chơi sẽ quay về hộp thoại trả lời của câu đó, với đồng hồ và quyền trả lời như trước lần chấm này.`,
      confirmLabel: 'Hoàn tác',
      danger: true,
      onConfirm: () => act({ type: 'UNDO' }),
    });
  };

  const rename = (teamId: string, name: string) => act({ type: 'SET_TEAM_NAME', teamId, name });

  let screen: React.ReactNode;
  if (state.phase === 'setup') {
    screen = welcome ? (
      <WelcomeScreen questionCount={total} onStart={() => setWelcome(false)} />
    ) : (
      <SetupScreen teams={state.teams} onRename={rename} onBack={() => setWelcome(true)} onStart={() => act({ type: 'START_GAME' })} />
    );
  } else if (state.phase === 'ready') {
    screen = (
      <RoundIntroScreen
        questionNumber={state.questionIndex + 1}
        total={total}
        standings={computeStandings(state)}
        onStart={() => act({ type: 'START_QUESTION', now: 0 })}
        onRenameTeams={() => setRenaming(true)}
      />
    );
  } else if (state.phase === 'running' || state.phase === 'paused_for_answer') {
    screen = (
      <PlayScreen
        question={question}
        questionNumber={state.questionIndex + 1}
        total={total}
        elapsedMs={elapsed}
        remainingMs={remainingMs(elapsed)}
        cluesRevealed={cluesRevealedAt(elapsed)}
        mode={state.phase === 'paused_for_answer' ? 'paused' : 'running'}
        teams={state.teams}
        names={names}
        scores={scores}
        ineligible={getIneligible(state)}
        flashTeamId={state.lastEvent?.kind === 'wrong' ? state.lastEvent.teamId : null}
        pause={pause}
        onPause={doPause}
      />
    );
  } else if (state.phase === 'round_complete') {
    const result = state.results[state.questionIndex]!;
    const isLastStep = allQuestionsComplete(state) || state.questionIndex === total - 1;
    screen = (
      <RoundResultScreen
        key={state.questionIndex}
        question={question}
        questionNumber={state.questionIndex + 1}
        result={result}
        winnerName={result.outcome === 'correct' ? describeTeam(result.teamId) : null}
        before={computeStandings(state, { excludeQuestion: state.questionIndex })}
        after={computeStandings(state)}
        isLastStep={isLastStep}
        onNext={() => goToQuestion(state.questionIndex + 1)}
        onFinal={showFinal}
      />
    );
  } else {
    screen = (
      <FinalScreen
        standings={computeStandings(state)}
        incomplete={!allQuestionsComplete(state)}
        onShowCredits={() => setShowCredits(true)}
      />
    );
  }

  return (
    <div className="app">
      <div className="stage" ref={stageRef}>
        <TopBar
          showGameControls={state.phase !== 'setup'}
          questionIndex={state.questionIndex}
          results={state.results}
          isFinal={state.phase === 'final'}
          canUndo={state.history.length > 0}
          onNavigate={goToQuestion}
          onUndo={undo}
          onReset={reset}
          onFullscreen={toggleFullscreen}
        />
        {screen}
      </div>

      <FeedbackLayer event={state.lastEvent} describeTeam={describeTeam} />

      {state.phase === 'paused_for_answer' && (
        <AnswerDialog
          // Fresh form for each new pause.
          key={`${state.questionIndex}-${state.round.accumulatedMs}-${state.round.ineligible.length}`}
          teams={state.teams}
          names={names}
          ineligible={state.round.ineligible}
          elapsedMs={state.round.accumulatedMs}
          restored={state.restored}
          rejectedMessage={state.lastEvent?.kind === 'rejected' ? state.lastEvent.message : null}
          onSubmit={(teamId, answer) => act({ type: 'SUBMIT_ANSWER', teamId, answer, now: 0 })}
          onResume={() => act({ type: 'RESUME', now: 0 })}
        />
      )}
      {showCredits && state.phase === 'final' && (
        <ImageCreditsDialog questions={questions} onClose={() => setShowCredits(false)} />
      )}
      {renaming && <TeamNamesDialog teams={state.teams} onRename={rename} onClose={() => setRenaming(false)} />}
      {confirm && <ConfirmDialog request={confirm} onClose={() => setConfirm(null)} />}
    </div>
  );
}
