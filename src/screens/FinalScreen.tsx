import { Confetti } from '../components/Confetti';
import { Podium } from '../components/Podium';
import type { Standing } from '../game/standings';
import { winners } from '../game/standings';

export function FinalScreen({
  standings,
  incomplete,
  onShowCredits,
}: {
  standings: Standing[];
  incomplete: boolean;
  onShowCredits: () => void;
}) {
  const champs = winners(standings);
  const rest = standings.slice(3);
  return (
    <main className="screen final">
      {champs.length > 0 && <Confetti />}
      <div className="spotlight spotlight-gold" aria-hidden="true" />
      <p className="eyebrow">Kết quả chung cuộc</p>
      <h1 className="final-title" role="status">
        {champs.length === 0
          ? 'Chưa có đội nào ghi điểm'
          : champs.length === 1
            ? <>Chúc mừng <span className="gold">{champs[0]!.name}</span>!</>
            : <>Đồng vô địch: <span className="gold">{champs.map((c) => c.name).join(' & ')}</span></>}
      </h1>
      <Podium standings={standings} />
      {rest.length > 0 && (
        <ol className="final-rest">
          {rest.map((s) => (
            <li key={s.teamId}>
              <span className="rest-rank">{s.rank}</span>
              <span className="rest-name">{s.name}</span>
              <span className="rest-score">{s.score}</span>
            </li>
          ))}
        </ol>
      )}
      {incomplete && <p className="screen-sub">Vẫn còn câu hỏi chưa chơi — chọn số câu ở thanh trên cùng để quay lại.</p>}
      <button type="button" className="btn btn-ghost btn-sm final-credits" onClick={onShowCredits}>
        Nguồn hình ảnh
      </button>
    </main>
  );
}
