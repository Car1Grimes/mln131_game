import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RoomPhase, ScreenView } from '../../../shared/protocol';
import { ProjectorMusicController, type MusicInput, type MusicState } from './controller';

class FakeAudio {
  preload = ''; src = ''; loop = false; paused = true; readyState = 4; duration = 60; currentTime = 0; seeking = false;
  onloadedmetadata: (() => void) | null = null; oncanplay: (() => void) | null = null; onseeked: (() => void) | null = null;
  onplaying: (() => void) | null = null; onwaiting: (() => void) | null = null; onended: (() => void) | null = null; onerror: (() => void) | null = null;
  play = vi.fn(async () => { this.paused = false; this.onplaying?.(); });
  pause = vi.fn(() => { this.paused = true; });
  load = vi.fn(() => { if (this.src) this.onloadedmetadata?.(); });
  removeAttribute() { this.src = ''; this.currentTime = 0; }
}
function view(phase: RoomPhase, round = 1): ScreenView {
  return { role: 'screen', room: { code: 'ABCDEF', phase, questionIndex: round - 1, totalQuestions: 6 }, teams: [], submittedCount: 0, standings: [], reveal: null, serverNow: Date.now(),
    round: { id: `round-id-${round}`, kind: 'main', questionNumber: round, totalQuestions: 6, startedAt: Date.now(), deadlineAt: Date.now() + 40000, durationMs: 40000, answerPattern: [], scenes: [] } };
}
let a: FakeAudio, c: ProjectorMusicController, input: MusicInput, state: MusicState;
let fetcher: ReturnType<typeof vi.fn>, create: ReturnType<typeof vi.fn>, revoke: ReturnType<typeof vi.fn>;
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
function update(v: ScreenView) { input = { ...input, view: v, experienceRound: v.round!.id }; c.update(input); }
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(100000);
  a = new FakeAudio(); fetcher = vi.fn(async () => ({ ok: true, blob: async () => new Blob(['fixture']) } as Response)); create = vi.fn(() => `blob:fixture-${create.mock.calls.length}`); revoke = vi.fn();
  state = { enabled: false, status: 'off' };
  c = new ProjectorMusicController(a as unknown as HTMLAudioElement, (s) => { state = s; }, { fetch: fetcher as typeof fetch, createUrl: create, revokeUrl: revoke });
  c.token = 'screen-test';
  input = { view: view('lobby'), connected: true, offset: 0, experienceRound: null }; c.update(input);
});
afterEach(() => { c.dispose(); vi.useRealTimers(); });

describe('persistent projector soundtrack', () => {
  it('complete six40s sequence uses exactly two definitions; silent results/ready; scene/count updates never restart', async () => {
    expect(fetcher).not.toHaveBeenCalled(); c.setEnabled(true); await flush(); expect(a.loop).toBe(true); expect(state.status).toBe('playing');
    for (let q = 1; q <= 6; q++) {
      const v = view('active', q); update(v); await flush(); expect(a.loop).toBe(false); expect(a.currentTime).toBe(0);
      const plays = a.play.mock.calls.length, loads = fetcher.mock.calls.length;
      for (let scene = 0; scene < 8; scene++) {
        if (scene) vi.advanceTimersByTime(5000);
        c.update({ ...input, view: { ...v, submittedCount: scene % 6, round: { ...v.round!, scenes: [{ id: `scene-${scene}`, kind: 'video', media: { assetId: 'same-fixture' }, at: scene * 5000, releasedAt: v.round!.startedAt + scene * 5000 }] } } });
        await flush(); expect(a.play).toHaveBeenCalledTimes(plays); expect(fetcher).toHaveBeenCalledTimes(loads);
      }
      vi.advanceTimersByTime(5000); expect(a.paused).toBe(true); expect(a.src).toBe('');
      update(view('revealed', q)); expect(state.status).toBe('waiting');
      c.setEnabled(false); expect(state.status).toBe('off'); c.setEnabled(true); await flush(); expect(a.src).toBe('');
      if (q < 6) { update(view('ready', q + 1)); c.setEnabled(false); c.setEnabled(true); await flush(); expect(a.src).toBe(''); }
    }
    update(view('finished', 6)); await flush(); expect(a.loop).toBe(true); expect(a.currentTime).toBe(0);
    expect(fetcher.mock.calls.map((x) => x[0].split('?')[0])).toEqual(['/api/screen/rooms/ABCDEF/music/lobby', ...Array(6).fill('/api/screen/rooms/ABCDEF/music/question'), '/api/screen/rooms/ABCDEF/music/lobby']);
    c.setEnabled(false); expect(a.paused).toBe(true); expect(a.src).toBe(''); expect(revoke).toHaveBeenCalledTimes(8);
    c.setEnabled(true); await flush(); expect(a.loop).toBe(true); expect(a.currentTime).toBe(0); expect(state.status).toBe('playing');
  });
  it('waits for actual visual promotion; late enable/load seeks to server time without extending deadline', async () => {
    const v = view('active'); c.update(input = { ...input, view: v }); c.setEnabled(true); await flush(); expect(fetcher).not.toHaveBeenCalled();
    vi.advanceTimersByTime(2000); c.update(input = { ...input, experienceRound: v.round!.id }); await flush(); expect(a.currentTime).toBe(2);
    vi.advanceTimersByTime(3000); c.update(input = { ...input, offset: 500 }); expect(a.currentTime).toBe(5.5);
    c.setEnabled(false); vi.advanceTimersByTime(500); c.setEnabled(true); await flush(); expect(a.currentTime).toBe(6);
    vi.advanceTimersByTime(34000); expect(a.paused).toBe(true); expect(a.src).toBe('');
  });
  it('stale async response after phase change/OFF cannot play or create a Blob URL', async () => {
    let resolve!: (r: Response) => void; fetcher.mockImplementationOnce(() => new Promise<Response>((r) => { resolve = r; }));
    c.setEnabled(true); update(view('ready')); resolve(new Response(new Blob(['stale']))); await flush();
    expect(create).not.toHaveBeenCalled(); expect(a.play).not.toHaveBeenCalled();
    c.setEnabled(false); expect(fetcher.mock.calls[0]![1].signal.aborted).toBe(true);
  });
  it('late load beyond authoritative deadline cannot start even without a new room view', async () => {
    let resolve!: (r: Response) => void; fetcher.mockImplementationOnce(() => new Promise<Response>((r) => { resolve = r; }));
    update(view('active')); c.setEnabled(true); vi.advanceTimersByTime(40000); resolve(new Response(new Blob(['late']))); await flush();
    expect(a.play).not.toHaveBeenCalled(); expect(create).not.toHaveBeenCalled(); expect(a.src).toBe('');
  });
  it('disconnect silences; reconnect waits for fresh state then aligns same round; new controller defaults OFF', async () => {
    const v = view('active'); update(v); c.setEnabled(true); await flush();
    c.update(input = { ...input, connected: false }); expect(a.paused).toBe(true);
    vi.advanceTimersByTime(8000); c.update(input = { ...input, connected: true }); await flush(); expect(fetcher).toHaveBeenCalledTimes(1);
    c.update(input = { ...input, view: { ...v } }); await flush(); expect(a.currentTime).toBe(8); expect(state.status).toBe('playing');
    c.dispose(); const other = new FakeAudio(); const fresh = new ProjectorMusicController(other as unknown as HTMLAudioElement, () => {});
    fresh.update(input); expect(other.play).not.toHaveBeenCalled(); fresh.dispose();
  });
  it.each(['NotAllowedError', 'NotSupportedError'])('reports %s without retry storms; OFF/ON explicitly retries', async (name) => {
    a.play.mockRejectedValueOnce(Object.assign(new Error('fixture'), { name }));
    c.setEnabled(true); await flush(); expect(state.status).toBe(name === 'NotAllowedError' ? 'blocked' : 'unavailable');
    vi.advanceTimersByTime(3000); expect(a.play).toHaveBeenCalledTimes(1);
    c.setEnabled(false); c.setEnabled(true); await flush(); expect(state.status).toBe('playing');
  });
  it('handles missing response, corrupted decode, and early end without looping question or harming state', async () => {
    fetcher.mockResolvedValueOnce(new Response('', { status: 404 })); c.setEnabled(true); await flush(); expect(state.status).toBe('unavailable');
    c.setEnabled(false); update(view('active')); c.setEnabled(true); await flush(); a.onerror?.(); expect(state.status).toBe('unavailable');
    c.setEnabled(false); c.setEnabled(true); await flush(); a.onended?.(); vi.advanceTimersByTime(1000); expect(state.status).toBe('ended'); expect(a.paused).toBe(true); expect(a.loop).toBe(false);
  });
  it('waits for the aligned seek before playing loaded media', async () => {
    const v = view('active'); vi.advanceTimersByTime(3000); a.seeking = true;
    update(v); c.setEnabled(true); await flush(); expect(a.play).not.toHaveBeenCalled();
    a.seeking = false; a.onseeked?.(); await flush(); expect(a.currentTime).toBe(3); expect(a.play).toHaveBeenCalledTimes(1);
  });
  it('stale play promise cannot change a later silent phase', async () => {
    let resolve!: () => void; a.play.mockImplementationOnce(() => new Promise<void>(r => { resolve = r; }));
    c.setEnabled(true); await flush(); update(view('ready')); resolve(); await flush();
    expect(state.status).toBe('waiting'); expect(a.paused).toBe(true); expect(a.src).toBe('');
  });
  it('an already elapsed short question track stays silent instead of looping/restarting', async () => {
    const v = view('active'); a.duration = 2; vi.advanceTimersByTime(3000);
    update(v); c.setEnabled(true); await flush(); expect(state.status).toBe('ended'); expect(a.play).not.toHaveBeenCalled(); expect(a.loop).toBe(false);
  });
  it('dispose aborts pending fetch and releases the only element and all URLs/timers', async () => {
    c.setEnabled(true); await flush(); c.dispose(); expect(a.src).toBe(''); expect(revoke).toHaveBeenCalledTimes(1); expect(vi.getTimerCount()).toBe(0);
  });
});
