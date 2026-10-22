import type { ReactNode } from 'react';
import type { ConnectionStatus } from '../net/useRoom';

const STATUS_TEXT: Record<ConnectionStatus, string> = {
  connecting: 'Đang kết nối…',
  connected: 'Đã kết nối',
  reconnecting: 'Mất kết nối — đang thử lại…',
  unauthorized: 'Phiên đăng nhập không hợp lệ',
};

export function AppHeader({ status, children }: { status?: ConnectionStatus; children?: ReactNode }) {
  return (
    <header className="topbar">
      <div className="brand" aria-label="WHAT IS THE KEYWORD?">
        <span className="brand-mark" aria-hidden="true" />
        <span className="brand-text">WHAT IS THE KEYWORD?</span>
      </div>
      <div className="topbar-center">{children}</div>
      {status && (
        <span className={`conn conn-${status}`} role="status">
          <span className="conn-dot" aria-hidden="true" />
          {STATUS_TEXT[status]}
        </span>
      )}
    </header>
  );
}
