import type { RoundReveal } from '../../shared/protocol';

const fmt = (ms: number | null) => (ms === null ? '—' : `${(ms / 1000).toFixed(1).replace('.', ',')} s`);

/**
 * All submissions of a closed round, in server order. Only rendered after the server reveals.
 * On phones the time column is hidden and the time shown under the answer instead (CSS).
 */
export function RevealTable({ reveal, highlightTeamId }: { reveal: RoundReveal; highlightTeamId?: string }) {
  return (
    <table className="mp-table reveal-table">
      <thead>
        <tr>
          <th>Thứ tự</th>
          <th>Đội</th>
          <th>Câu trả lời</th>
          <th className="cell-time">Thời điểm</th>
          <th>Kết quả</th>
          <th className="num">Điểm</th>
        </tr>
      </thead>
      <tbody>
        {reveal.submissions.map((s) => (
          <tr key={s.teamId} className={`${s.correct ? 'is-correct' : 'is-wrong'}${s.teamId === highlightTeamId ? ' is-me' : ''}`}>
            <td>{s.orderRank ?? '—'}</td>
            <td className="cell-name">
              <span className="cell-name-text" title={s.teamName}>
                {s.teamName}
              </span>
            </td>
            <td className="cell-answer">
              {s.answer ?? <em>Không nộp</em>}
              {s.responseMs !== null && <span className="cell-time-sub">{fmt(s.responseMs)}</span>}
            </td>
            <td className="cell-time">{fmt(s.responseMs)}</td>
            <td>{s.answer === null ? 'Không nộp' : s.correct ? 'Đúng' : 'Sai'}</td>
            <td className="num">{s.points > 0 ? `+${s.points}` : '0'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
