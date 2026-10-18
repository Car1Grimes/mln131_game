import type { RoundReveal } from '../../shared/protocol';

const fmt = (ms: number | null) => (ms === null ? '—' : `${(ms / 1000).toFixed(1).replace('.', ',')} s`);

/** All submissions of a closed round, in server order. Only rendered after the server reveals. */
export function RevealTable({ reveal, highlightTeamId }: { reveal: RoundReveal; highlightTeamId?: string }) {
  return (
    <table className="mp-table reveal-table">
      <thead>
        <tr>
          <th>Thứ tự</th>
          <th>Đội</th>
          <th>Câu trả lời</th>
          <th>Thời điểm</th>
          <th>Kết quả</th>
          <th className="num">Điểm</th>
        </tr>
      </thead>
      <tbody>
        {reveal.submissions.map((s) => (
          <tr key={s.teamId} className={`${s.correct ? 'is-correct' : 'is-wrong'}${s.teamId === highlightTeamId ? ' is-me' : ''}`}>
            <td>{s.orderRank ?? '—'}</td>
            <td className="cell-name">{s.teamName}</td>
            <td className="cell-answer">{s.answer ?? <em>Không nộp</em>}</td>
            <td>{fmt(s.responseMs)}</td>
            <td>{s.answer === null ? 'Không nộp' : s.correct ? 'Đúng' : 'Sai'}</td>
            <td className="num">{s.points > 0 ? `+${s.points}` : '0'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
