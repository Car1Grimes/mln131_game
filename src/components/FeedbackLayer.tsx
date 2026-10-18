import { useEffect, useRef, useState } from 'react';
import type { LastEvent } from '../game/types';

interface Toast {
  id: number;
  tone: 'wrong' | 'info';
  title: string;
  detail: string;
}

/**
 * Non-blocking feedback (pointer-events: none) for state-machine events that happen after load.
 * Events restored from storage on page load are not replayed.
 */
export function FeedbackLayer({ event, describeTeam }: { event: LastEvent | null; describeTeam: (id: string) => string }) {
  const [toast, setToast] = useState<Toast | null>(null);
  const initial = useRef(event);
  const counter = useRef(0);
  const describe = useRef(describeTeam);
  describe.current = describeTeam;

  useEffect(() => {
    if (!event || event === initial.current) return;
    initial.current = null;
    let next: Omit<Toast, 'id'> | null = null;
    if (event.kind === 'wrong') {
      next = {
        tone: 'wrong',
        title: 'Chưa chính xác!',
        detail: `${describe.current(event.teamId)} đã hết lượt ở câu này. Đồng hồ tiếp tục chạy.`,
      };
    } else if (event.kind === 'undo') {
      next = { tone: 'info', title: 'Đã hoàn tác', detail: event.label };
    }
    if (!next) return;
    const id = ++counter.current;
    setToast({ ...next, id });
    const t = window.setTimeout(() => setToast((cur) => (cur?.id === id ? null : cur)), 3200);
    return () => window.clearTimeout(t);
  }, [event]);

  return (
    <div className="feedback-layer" aria-live="assertive" aria-atomic="true">
      {toast && (
        <div key={toast.id} className={`toast toast-${toast.tone}`}>
          {toast.tone === 'wrong' && <div className="flash-wrong" aria-hidden="true" />}
          <strong className="toast-title">{toast.title}</strong>
          <span className="toast-detail">{toast.detail}</span>
        </div>
      )}
    </div>
  );
}
