import { MAX_TEAM_NAME_LENGTH, defaultTeamName } from '../game/rules';
import type { Team, TeamId } from '../game/types';
import { Modal } from './Modal';

export function TeamNamesDialog({ teams, onRename, onClose }: { teams: Team[]; onRename: (id: TeamId, name: string) => void; onClose: () => void }) {
  return (
    <Modal title="Đổi tên đội" onEscape={onClose}>
      <TeamNameFields teams={teams} onRename={onRename} />
      <div className="modal-actions">
        <button type="button" className="btn btn-primary" onClick={onClose}>
          Xong
        </button>
      </div>
    </Modal>
  );
}

export function TeamNameFields({ teams, onRename }: { teams: Team[]; onRename: (id: TeamId, name: string) => void }) {
  const names = teams.map((t, i) => t.name.trim() || defaultTeamName(i));
  const duplicates = new Set(names.filter((n, i) => names.indexOf(n) !== i));
  return (
    <div className="name-fields">
      {teams.map((t, i) => (
        <label key={t.id} className="field">
          <span className="field-label">
            Đội {i + 1}
            <span className="field-count">
              {t.name.length}/{MAX_TEAM_NAME_LENGTH}
            </span>
          </span>
          <input
            value={t.name}
            placeholder={defaultTeamName(i)}
            maxLength={MAX_TEAM_NAME_LENGTH}
            onChange={(e) => onRename(t.id, e.target.value)}
            data-autofocus={i === 0 ? true : undefined}
          />
          {duplicates.has(names[i]!) && <span className="field-warn">Tên này bị trùng với đội khác</span>}
        </label>
      ))}
    </div>
  );
}
