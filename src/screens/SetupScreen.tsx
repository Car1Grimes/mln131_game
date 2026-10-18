import { TeamNameFields } from '../components/TeamNamesDialog';
import type { Team, TeamId } from '../game/types';

interface Props {
  teams: Team[];
  onRename: (id: TeamId, name: string) => void;
  onStart: () => void;
  onBack: () => void;
}

export function SetupScreen({ teams, onRename, onStart, onBack }: Props) {
  return (
    <main className="screen setup">
      <div className="setup-card">
        <p className="eyebrow">Chuẩn bị</p>
        <h1 className="screen-title">Thiết lập đội chơi</h1>
        <p className="screen-sub">Đặt tên cho năm đội. Ô để trống sẽ dùng tên mặc định.</p>
        <TeamNameFields teams={teams} onRename={onRename} />
        <div className="setup-actions">
          <button type="button" className="btn btn-ghost btn-lg" onClick={onBack}>
            Quay lại
          </button>
          <button type="button" className="btn btn-primary btn-lg" onClick={onStart}>
            Vào trò chơi
          </button>
        </div>
      </div>
    </main>
  );
}
