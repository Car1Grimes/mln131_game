import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { AttributionEntry, RoundReveal } from '../../shared/protocol';
import { Modal } from './Modal';
import { safeExternalUrl } from './safeUrl';

/**
 * "Nguồn tư liệu": the media credits of the closed round, on demand. The data arrives only inside
 * the server's RoundReveal (after the round is closed) and covers this question only. The panel is a
 * local overlay: it never replaces the results or the leaderboard, and it disappears with the reveal
 * (advance to the next question) because it is rendered by the reveal screen.
 */
export function AttributionPanel({ reveal }: { reveal: RoundReveal }) {
  const [open, setOpen] = useState(false);
  const opener = useRef<HTMLButtonElement>(null);
  // While the dialog is open the whole app behind it (#root) is inert: no focus, no clicks, hidden
  // from assistive technology. The dialog itself is portalled outside #root.
  useEffect(() => {
    const root = document.getElementById('root');
    if (!open || !root) return;
    root.inert = true;
    return () => {
      root.inert = false;
    };
  }, [open]);
  const a = reveal.attribution;
  if (!a || a.entries.length === 0) return null;
  const close = () => {
    setOpen(false);
    requestAnimationFrame(() => opener.current?.focus());
  };
  return (
    <>
      <button ref={opener} type="button" className="btn btn-sm btn-ghost attribution-open" data-testid="attribution-open" aria-haspopup="dialog" onClick={() => setOpen(true)}>
        Nguồn tư liệu ({a.entries.length})
      </button>
      {open &&
        // Portal: the reveal screens animate their children (own stacking contexts); the dialog must
        // sit above all of them.
        createPortal(
          <Modal title={`Nguồn tư liệu · Câu ${reveal.questionNumber}`} onEscape={close} wide>
            <div className="attribution" data-testid="attribution-panel">
              <button type="button" className="btn btn-sm btn-ghost attribution-back" data-testid="attribution-close-top" onClick={close}>
                ← Quay lại kết quả
              </button>
              <p className="attribution-intro">Hình ảnh, bản đồ và phông chữ dùng trong các đoạn phim của câu này. Liên kết mở trong thẻ mới.</p>
              <ol className="attribution-list">
                {a.entries.map((e) => (
                  <AttributionItem key={e.id} entry={e} />
                ))}
              </ol>
              {a.adaptations.length > 0 && (
                <section className="attribution-adaptations" aria-label="Giấy phép của các đoạn phim phỏng tác">
                  <h3 className="attribution-subhead">Đoạn phim phỏng tác (chia sẻ tương tự)</h3>
                  <ul>
                    {a.adaptations.map((x) => (
                      <li key={x.clip}>
                        Đoạn phim phát lúc {fmtAt(x.atMs)} là tác phẩm phái sinh, phát hành theo{' '}
                        <ExternalLink href={x.licenceUrl}>{x.licence}</ExternalLink>.
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </div>
            <div className="modal-actions">
              <button type="button" className="btn btn-primary" data-testid="attribution-close" onClick={close}>
                Quay lại kết quả
              </button>
            </div>
          </Modal>,
          document.body,
        )}
    </>
  );
}

const RIGHTS_LABEL: Record<AttributionEntry['rights'], string> = {
  cc: 'Giấy phép Creative Commons',
  pd: 'Phạm vi công cộng',
  'pd-qualified': 'Phạm vi công cộng có điều kiện',
  'open-font': 'Giấy phép phông chữ mở',
  own: 'Tác phẩm gốc',
  unresolved: 'Quyền chưa xác định',
};
const KIND_LABEL: Record<AttributionEntry['kind'], string> = { photo: 'Ảnh', map: 'Bản đồ', font: 'Phông chữ', own: 'Đồ họa' };

function AttributionItem({ entry: e }: { entry: AttributionEntry }) {
  return (
    <li className="attribution-item" data-testid="attribution-item" data-rights={e.rights}>
      <div className="attribution-head">
        <span className="attribution-kind">{KIND_LABEL[e.kind]}</span>
        <span className={`chip attribution-rights rights-${e.rights}`}>{RIGHTS_LABEL[e.rights]}</span>
      </div>
      <h3 className="attribution-title">{e.title}</h3>
      <dl className="attribution-meta">
        <dt>Tác giả</dt>
        <dd>{e.creator}</dd>
        <dt>Giấy phép</dt>
        <dd>
          {e.licenceUrl ? <ExternalLink href={e.licenceUrl}>{e.licence}</ExternalLink> : e.licence}
          {e.rightsNote && <span className="attribution-note">{e.rightsNote}</span>}
        </dd>
        {e.sourceUrl && (
          <>
            <dt>Nguồn</dt>
            <dd>
              <ExternalLink href={e.sourceUrl} className="attribution-url">
                {prettyUrl(e.sourceUrl)}
              </ExternalLink>
            </dd>
          </>
        )}
        <dt>Xuất hiện</dt>
        <dd>{e.usedIn.map((u) => `${fmtAt(u.atMs)} (cảnh ${u.sceneId})`).join(' · ')}</dd>
        {e.modifications.length > 0 && (
          <>
            <dt>Thay đổi</dt>
            <dd>
              <ul className="attribution-mods">
                {e.modifications.map((m) => (
                  <li key={m}>{m}</li>
                ))}
              </ul>
            </dd>
          </>
        )}
      </dl>
    </li>
  );
}

/** External links: new tab, no opener, no referrer. Anything but an absolute http(s) URL is plain text. */
function ExternalLink({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) {
  const safe = safeExternalUrl(href);
  if (!safe) return <span className={className}>{children}</span>;
  return (
    <a href={safe} target="_blank" rel="noopener noreferrer" className={className}>
      {children}
    </a>
  );
}

function prettyUrl(raw: string): string {
  const u = safeExternalUrl(raw) ?? raw;
  try {
    return decodeURI(u).replace(/^https?:\/\//, '');
  } catch {
    return u.replace(/^https?:\/\//, '');
  }
}

function fmtAt(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
