import type { ReleasedScene } from '../../shared/scenes';

/**
 * Shows the most recently released scene. M1 only uses the neutral placeholder; the other kinds are
 * rendered minimally so the interface is ready for the scene engine (M2). Media is never resolved
 * from a client-side list: it will arrive as an authorised URL with the released scene.
 */
export function SceneStage({ scenes, questionNumber }: { scenes: ReleasedScene[]; questionNumber: number }) {
  const scene = scenes[scenes.length - 1];
  return (
    <section className="scene-stage" aria-live="polite" aria-label={`Câu hỏi ${questionNumber}`}>
      {!scene ? (
        <div className="scene-placeholder">
          <span className="scene-title">Câu hỏi {questionNumber}</span>
        </div>
      ) : scene.kind === 'placeholder' ? (
        <div key={scene.id} className="scene-placeholder scene-enter">
          <span className="scene-title">{scene.title}</span>
          {scene.subtitle && <span className="scene-subtitle">{scene.subtitle}</span>}
        </div>
      ) : scene.kind === 'text-card' ? (
        <div key={scene.id} className="scene-card scene-enter">
          {scene.heading && <h3>{scene.heading}</h3>}
          <p>{scene.body}</p>
        </div>
      ) : scene.kind === 'date' ? (
        <div key={scene.id} className="scene-card scene-enter">
          <span className="scene-date">{scene.date}</span>
          {scene.label && <p>{scene.label}</p>}
        </div>
      ) : scene.kind === 'statistic' ? (
        <div key={scene.id} className="scene-card scene-enter">
          <span className="scene-date">
            {scene.value}
            {scene.unit ? ` ${scene.unit}` : ''}
          </span>
          <p>{scene.label}</p>
        </div>
      ) : (
        <div key={scene.id} className="scene-placeholder scene-enter">
          <span className="scene-subtitle">Nội dung đa phương tiện (sẽ có ở bản tiếp theo)</span>
        </div>
      )}
    </section>
  );
}
