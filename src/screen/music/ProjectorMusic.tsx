import { useLayoutEffect, useRef, useState } from 'react';
import { ProjectorMusicController, type MusicInput, type MusicState, type MusicStatus } from './controller';

const LABELS: Record<MusicStatus, string> = {
  off: 'Nhạc đang tắt', waiting: 'Đang chờ · không phát nhạc', loading: 'Đang tải nhạc…',
  playing: 'Đang phát nhạc', blocked: 'Trình duyệt chặn nhạc · tắt rồi bật lại',
  unavailable: 'Không tải được nhạc · kiểm tra các tệp MP3, rồi tắt/bật lại', ended: 'Bản nhạc đã kết thúc',
};

export function ProjectorMusic({ token, ...input }: MusicInput & { token: string }) {
  const audio = useRef<HTMLAudioElement>(null);
  const controller = useRef<ProjectorMusicController | null>(null);
  const [state, setState] = useState<MusicState>({ enabled: false, status: 'off' });
  useLayoutEffect(() => {
    const c = new ProjectorMusicController(audio.current!, setState);
    c.token = token;
    controller.current = c;
    return () => { c.dispose(); controller.current = null; };
  }, [token]);
  useLayoutEffect(() => { controller.current?.update(input); }, [input.view, input.connected, input.offset, input.experienceRound, token]);
  return (
    <div className="screen-music-control">
      <audio ref={audio} hidden data-testid="screen-music-audio" />
      {/* No visible status line: the state stays available as a hover tooltip and data attribute. */}
      <button type="button" className={`btn btn-sm ${state.enabled ? 'btn-primary' : 'btn-ghost'}`}
        aria-pressed={state.enabled} data-testid="screen-music" data-status={state.status} title={LABELS[state.status]}
        onClick={() => controller.current?.setEnabled(!state.enabled)}>
        {state.enabled ? 'Tắt nhạc' : 'Bật nhạc'}
      </button>
    </div>
  );
}
