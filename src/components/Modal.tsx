import { useEffect, useId, useRef, type ReactNode } from 'react';

interface ModalProps {
  title: string;
  children: ReactNode;
  /** Called on Escape. Omit to make Escape do nothing (e.g. to avoid accidentally resuming the clock). */
  onEscape?: () => void;
  tone?: 'default' | 'danger';
  wide?: boolean;
}

/**
 * Centered modal over a dimmed, blurred backdrop. Backdrop clicks do nothing to avoid accidental
 * dismissal. The rest of the page is made inert by the parent while a modal is open; Tab is kept
 * inside the dialog.
 */
export function Modal({ title, children, onEscape, tone = 'default', wide }: ModalProps) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    const root = ref.current;
    const target = root?.querySelector<HTMLElement>('[data-autofocus]') ?? root;
    target?.focus();
  }, []);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape' && onEscape) {
      e.stopPropagation();
      onEscape();
      return;
    }
    if (e.key !== 'Tab' || !ref.current) return;
    const focusables = Array.from(
      ref.current.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), [tabindex]:not([tabindex="-1"])'),
    );
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (!first || !last) return;
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  return (
    <div className="modal-backdrop">
      <div
        className={`modal modal-${tone}${wide ? ' modal-wide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        ref={ref}
        tabIndex={-1}
        onKeyDown={onKeyDown}
      >
        <h2 className="modal-title" id={titleId}>
          {title}
        </h2>
        {children}
      </div>
    </div>
  );
}

export interface ConfirmRequest {
  title: string;
  message: string;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void;
}

export function ConfirmDialog({ request, onClose }: { request: ConfirmRequest; onClose: () => void }) {
  return (
    <Modal title={request.title} onEscape={onClose} tone={request.danger ? 'danger' : 'default'}>
      <p className="modal-message">{request.message}</p>
      <div className="modal-actions">
        <button type="button" className="btn btn-ghost" onClick={onClose} data-autofocus>
          Hủy
        </button>
        <button
          type="button"
          className={request.danger ? 'btn btn-danger' : 'btn btn-primary'}
          onClick={() => {
            onClose();
            request.onConfirm();
          }}
        >
          {request.confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
