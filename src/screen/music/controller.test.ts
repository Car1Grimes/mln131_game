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
  return { role: 'screen', room: { code: 'ABCDEF', phase, questionIndex: round - 1, totalQuestions: 6 }, teams: [], submittedCount: 0, standings: [], reveal: null, serverNow: Date.now(), intro: null,
    round: { id: `round-id-${round}`, kind: 'main', questionNumber: round, totalQuestions: 6, prompt: '', startedAt: Date.now(), deadlineAt: Date.now() + 40000, durationMs: 40000, answerPattern: [], scenes: [] } };
}
/** Intro view: no round (nothing of the question), only the server's intro times. */
function introView(round = 1, introStartedAt = Date.now()): ScreenView {
  return { ...view('intro', round), round: null, intro: { questionNumber: round, totalQuestions: 6, prompt: 'Câu hỏi định hướng?', introStartedAt, startsAt: introStartedAt + 5000 } };
}
const tracks = () => fetcher.mock.calls.map((x) => (x[0] as string).split('?')[0]!.split('/').pop());
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
    // Besides the generic effects (intro preloaded while waiting, result preloaded during play), exactly lobby, 6× question, lobby.
    expect(fetcher.mock.calls.map((x) => x[0].split('?')[0]).filter((u: string) => !u.endsWith('/intro') && !u.endsWith('/result'))).toEqual(['/api/screen/rooms/ABCDEF/music/lobby', ...Array(6).fill('/api/screen/rooms/ABCDEF/music/question'), '/api/screen/rooms/ABCDEF/music/lobby']);
    // Intro preload: once in the lobby, then per ready phase on entry and again after each explicit OFF/ON.
    expect(tracks().filter((x) => x === 'intro')).toHaveLength(11);
    // Result preload: once per active round here (each round's OFF/ON dropped the cached effect).
    expect(tracks().filter((x) => x === 'result')).toHaveLength(6);
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
    vi.advanceTimersByTime(8000); c.update(input = { ...input, connected: true }); await flush(); expect(tracks().filter((x) => x === 'question')).toHaveLength(1);
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

describe('intro effect (M4.3 step 2)', () => {
  it('lobby → intro effect → question music: no overlap, one element, effect cut at the active start', async () => {
    c.setEnabled(true); await flush();
    expect(a.loop).toBe(true); expect(tracks()).toEqual(['lobby', 'intro']); // generic intro preloaded while waiting
    const iv = introView(); c.update(input = { ...input, view: iv, experienceRound: null }); await flush();
    expect(fetcher).toHaveBeenCalledTimes(2); // the preloaded effect is used: no network at the intro start
    expect(a.loop).toBe(false); expect(a.currentTime).toBe(0); expect(state.status).toBe('playing');
    expect(revoke).toHaveBeenCalledTimes(1); // lobby source released before the effect starts
    const plays = a.play.mock.calls.length;
    for (let i = 0; i < 4; i++) { vi.advanceTimersByTime(1000); c.update(input = { ...input, view: { ...iv, serverNow: Date.now() } }); await flush(); }
    expect(a.play).toHaveBeenCalledTimes(plays); // view updates never restart the effect
    vi.advanceTimersByTime(1000); // the active start: cut even before the server's next view arrives
    expect(a.paused).toBe(true); expect(a.src).toBe(''); expect(state.status).toBe('waiting');
    const v = { ...view('active'), round: { ...view('active').round!, startedAt: iv.intro!.startsAt, deadlineAt: iv.intro!.startsAt + 40000 } };
    update(v); await flush();
    expect(tracks()).toEqual(['lobby', 'intro', 'question', 'result']); expect(state.status).toBe('playing'); expect(a.currentTime).toBe(0);
    vi.advanceTimersByTime(40000); expect(a.paused).toBe(true);
    update(view('revealed')); expect(state.status).toBe('waiting'); expect(a.src).toBe('');
    update(view('ready', 2)); await flush(); expect(state.status).toBe('waiting'); expect(a.src).toBe('');
    expect(tracks().filter((x) => x === 'intro')).toHaveLength(1); // still cached: no new request in ready
    update(view('finished', 6)); await flush(); expect(a.loop).toBe(true); expect(a.currentTime).toBe(0); expect(tracks().at(-1)).toBe('lobby');
  });
  it('a shorter effect ends in silence for the rest of the intro; a longer one is stopped at the boundary', async () => {
    c.setEnabled(true); await flush();
    a.duration = 2; c.update(input = { ...input, view: introView() }); await flush(); expect(state.status).toBe('playing');
    vi.advanceTimersByTime(2000); a.onended?.(); expect(state.status).toBe('ended'); expect(a.paused).toBe(true);
    vi.advanceTimersByTime(1000); expect(a.play).toHaveBeenCalledTimes(2); // lobby + one effect: never looped/restarted
    c.update(input = { ...input, view: view('ready', 2) }); await flush();
    a.duration = 12; c.update(input = { ...input, view: introView(2) }); await flush(); expect(state.status).toBe('playing');
    vi.advanceTimersByTime(4999); expect(a.paused).toBe(false);
    vi.advanceTimersByTime(1); expect(a.paused).toBe(true); expect(a.src).toBe('');
  });
  it('a late join aligns to the server intro start; past the effect it stays silent', async () => {
    c.setEnabled(true); await flush();
    c.update(input = { ...input, view: introView(1, Date.now() - 1500) }); await flush(); expect(a.currentTime).toBe(1.5);
    c.update(input = { ...input, view: view('ready', 2) }); await flush();
    a.duration = 2; c.update(input = { ...input, view: introView(2, Date.now() - 3000) }); await flush();
    expect(state.status).toBe('ended'); expect(a.play).toHaveBeenCalledTimes(2);
  });
  it('master OFF: no preload, no effect; ON during the intro plays the remainder', async () => {
    c.update(input = { ...input, view: introView() }); await flush(); expect(fetcher).not.toHaveBeenCalled(); expect(state.status).toBe('off');
    vi.advanceTimersByTime(1000); c.setEnabled(true); await flush(); expect(tracks()).toEqual(['intro']); expect(a.currentTime).toBe(1);
    c.setEnabled(false); expect(a.paused).toBe(true); expect(a.src).toBe('');
  });
  it('missing, delayed and corrupt effect never affect the intro; no retry storm', async () => {
    fetcher.mockImplementation(async (url: string) => (url.endsWith('/intro') ? new Response('', { status: 404 }) : ({ ok: true, blob: async () => new Blob(['fixture']) } as Response)));
    c.setEnabled(true); await flush(); expect(tracks()).toEqual(['lobby', 'intro']);
    vi.advanceTimersByTime(5000); expect(tracks()).toEqual(['lobby', 'intro']); // one preload attempt per waiting phase
    c.update(input = { ...input, view: introView() }); await flush(); expect(state.status).toBe('unavailable'); expect(tracks()).toEqual(['lobby', 'intro', 'intro']);
    vi.advanceTimersByTime(3000); expect(tracks()).toHaveLength(3);
    // Delayed: a response arriving after the active start is discarded without a Blob URL or playback.
    let resolve!: (r: Response) => void;
    fetcher.mockImplementation((url: string) => (url.endsWith('/intro') ? new Promise<Response>((r) => { resolve = r; }) : Promise.resolve({ ok: true, blob: async () => new Blob(['q']) } as Response)));
    c.update(input = { ...input, view: view('ready', 2) }); await flush();
    resolve(new Response(new Blob(['late-preload']))); await flush();
    c.setEnabled(false); c.setEnabled(true); await flush(); // OFF/ON re-reads the file (dropped cache)
    const hungPreload = fetcher.mock.calls.at(-1)![1].signal as AbortSignal;
    c.update(input = { ...input, view: introView(2) }); await flush();
    expect(hungPreload.aborted).toBe(true); // a pending preload never blocks later phases
    const before = create.mock.calls.length;
    vi.advanceTimersByTime(5000); resolve(new Response(new Blob(['late']))); await flush();
    expect(create.mock.calls.length).toBe(before); expect(a.src).toBe('');
    // Corrupt: decode error reported; cache dropped so a replaced file is fetched next time.
    fetcher.mockImplementation(async () => ({ ok: true, blob: async () => new Blob(['corrupt']) } as Response));
    c.update(input = { ...input, view: view('ready', 3) }); await flush();
    c.update(input = { ...input, view: introView(3) }); await flush(); a.onerror?.(); expect(state.status).toBe('unavailable'); expect(a.paused).toBe(true);
    const n = tracks().length;
    c.update(input = { ...input, view: view('ready', 4) }); await flush(); expect(tracks().length).toBe(n + 1);
  });
  it('autoplay rejection during the intro is reported, not retried, and does not touch the visuals', async () => {
    c.setEnabled(true); await flush();
    a.play.mockRejectedValueOnce(Object.assign(new Error('fixture'), { name: 'NotAllowedError' }));
    c.update(input = { ...input, view: introView() }); await flush(); expect(state.status).toBe('blocked');
    const plays = a.play.mock.calls.length; vi.advanceTimersByTime(2000); expect(a.play).toHaveBeenCalledTimes(plays);
  });
});

describe('result effect (M4.3 step 3)', () => {
  const activeView = (q = 1): ScreenView => { const v = view('active', q); return { ...v, round: { ...v.round!, startedAt: Date.now(), deadlineAt: Date.now() + 40000 } }; };
  const revealedView = (q = 1, extra: Partial<ScreenView> = {}): ScreenView => ({ ...view('revealed', q), reveal: { roundId: `round-id-${q}`, questionNumber: q } as ScreenView['reveal'], ...extra });
  /** One live round: active (visuals ready) then the server's closing view. */
  const playRound = async (q: number) => {
    update(activeView(q)); await flush();
    vi.advanceTimersByTime(40000); await flush();
    c.update(input = { ...input, view: revealedView(q) }); await flush();
  };
  const resultSrcCount = () => create.mock.calls.length;

  it('active → revealed: question stopped, preloaded effect plays once, never looped; duplicates and ready stay silent', async () => {
    c.setEnabled(true); await flush();
    update(activeView(1)); await flush();
    expect(tracks()).toEqual(['lobby', 'intro', 'question', 'result']); // result preloaded during play, after visuals
    const urlsBefore = create.mock.calls.length;
    expect(a.loop).toBe(false); expect(state.status).toBe('playing');
    vi.advanceTimersByTime(40000); await flush(); expect(a.paused).toBe(true); expect(a.src).toBe('');
    c.update(input = { ...input, view: revealedView(1) }); await flush();
    expect(tracks()).toHaveLength(4); // the preloaded blob is used: no request at the reveal
    expect(create.mock.calls.length).toBe(urlsBefore + 1); expect(revoke).toHaveBeenCalledTimes(urlsBefore); // question URL released first
    expect(a.loop).toBe(false); expect(a.currentTime).toBe(0); expect(state.status).toBe('playing');
    const plays = a.play.mock.calls.length;
    for (let i = 0; i < 5; i++) { c.update(input = { ...input, view: revealedView(1, { submittedCount: i, serverNow: Date.now() + i }) }); await flush(); }
    expect(a.play).toHaveBeenCalledTimes(plays); // duplicate/unrelated state updates never replay
    a.onended?.(); vi.advanceTimersByTime(3000); await flush();
    expect(state.status).toBe('ended'); expect(a.paused).toBe(true); expect(a.play).toHaveBeenCalledTimes(plays); // ends naturally, result screen stays silent
    c.update(input = { ...input, view: view('ready', 2) }); await flush();
    expect(a.src).toBe(''); expect(state.status).toBe('waiting');
  });

  it('each of Q1–Q6 gets exactly one effect; Q6 result → finished starts the lobby loop', async () => {
    c.setEnabled(true); await flush();
    for (let q = 1; q <= 6; q++) {
      const urls = resultSrcCount();
      await playRound(q);
      expect(create.mock.calls.length).toBe(urls + 2); // question + one result source
      expect(state.status).toBe('playing'); expect(a.loop).toBe(false);
      if (q < 6) { c.update(input = { ...input, view: view('ready', q + 1) }); await flush(); expect(a.src).toBe(''); }
    }
    expect(tracks().filter((x) => x === 'result')).toHaveLength(1); // generic effect fetched once and reused
    c.update(input = { ...input, view: view('finished', 6) }); await flush();
    expect(a.loop).toBe(true); expect(a.currentTime).toBe(0); expect(state.status).toBe('playing');
    expect(tracks().at(-1)).toBe('lobby');
  });

  it('master OFF suppresses it; OFF/ON during the same result never replays it', async () => {
    update(activeView(1)); await flush(); vi.advanceTimersByTime(40000);
    c.update(input = { ...input, view: revealedView(1) }); await flush();
    expect(fetcher).not.toHaveBeenCalled(); expect(state.status).toBe('off');
    c.setEnabled(true); await flush(); expect(a.src).toBe(''); expect(state.status).toBe('waiting'); // ON later: still silent
    c.update(input = { ...input, view: view('ready', 2) }); await flush();
    await playRound(2); expect(state.status).toBe('playing');
    const plays = a.play.mock.calls.length, urls = create.mock.calls.length;
    c.setEnabled(false); expect(a.paused).toBe(true); expect(a.src).toBe('');
    c.setEnabled(true); await flush(); vi.advanceTimersByTime(1000); await flush();
    expect(a.play).toHaveBeenCalledTimes(plays); expect(create.mock.calls.length).toBe(urls); expect(a.src).toBe('');
  });

  it('mounting on, refreshing into or reconnecting into a revealed result never plays it', async () => {
    c.setEnabled(true); await flush();
    update(activeView(1)); await flush(); vi.advanceTimersByTime(40000);
    c.update(input = { ...input, connected: false }); // the close happens while disconnected
    c.update(input = { ...input, connected: true }); await flush();
    c.update(input = { ...input, view: revealedView(1) }); await flush();
    expect(a.src).toBe(''); expect(state.status).toBe('waiting');
    // Played live, then a disconnect/reconnect into the same result: no replay.
    c.update(input = { ...input, view: view('ready', 2) }); await playRound(2);
    const plays = a.play.mock.calls.length;
    c.update(input = { ...input, connected: false }); c.update(input = { ...input, connected: true });
    c.update(input = { ...input, view: revealedView(2) }); await flush();
    expect(a.play).toHaveBeenCalledTimes(plays); expect(a.src).toBe('');
    // A fresh controller (page refresh) mounted on the revealed phase.
    const other = new FakeAudio(); const fresh = new ProjectorMusicController(other as unknown as HTMLAudioElement, () => {}, { fetch: fetcher as typeof fetch, createUrl: create, revokeUrl: revoke });
    fresh.setEnabled(true); fresh.update({ view: revealedView(2), connected: true, offset: 0, experienceRound: null }); await flush();
    expect(other.play).not.toHaveBeenCalled(); fresh.dispose();
  });

  it('delayed fetch: plays when it arrives during the result, discarded if the phase moved on', async () => {
    let resolve!: (r: Response) => void;
    fetcher.mockImplementation((url: string) => (url.endsWith('/result') ? new Promise<Response>((r) => { resolve = r; }) : Promise.resolve({ ok: true, blob: async () => new Blob(['x']) } as Response)));
    c.setEnabled(true); await flush();
    update(activeView(1)); await flush(); vi.advanceTimersByTime(40000);
    const preload = fetcher.mock.calls.find((x) => x[0].endsWith('/result'))![1].signal as AbortSignal;
    c.update(input = { ...input, view: revealedView(1) }); await flush();
    expect(preload.aborted).toBe(true); // pending preload abandoned; the reveal fetches on its own
    expect(state.status).toBe('loading');
    resolve({ ok: true, blob: async () => new Blob(['late-result']) } as Response); await flush();
    expect(state.status).toBe('playing');
    c.update(input = { ...input, view: view('ready', 2) }); await flush();
    update(activeView(2)); await flush(); vi.advanceTimersByTime(40000);
    c.setEnabled(false); c.setEnabled(true); // drop cache: the reveal must fetch
    c.update(input = { ...input, view: revealedView(2) }); await flush();
    c.update(input = { ...input, view: view('ready', 3) }); await flush(); // admin advanced before it arrived
    const urls = create.mock.calls.length;
    resolve({ ok: true, blob: async () => new Blob(['too-late']) } as Response); await flush();
    expect(create.mock.calls.length).toBe(urls); expect(a.src).toBe(''); expect(a.paused).toBe(true);
  });

  it('missing, corrupt and autoplay-blocked effect are reported once and never retried', async () => {
    fetcher.mockImplementation(async (url: string) => (url.endsWith('/result') ? new Response('', { status: 404 }) : ({ ok: true, blob: async () => new Blob(['x']) } as Response)));
    c.setEnabled(true); await flush();
    await playRound(1); expect(state.status).toBe('unavailable');
    const n = fetcher.mock.calls.length; vi.advanceTimersByTime(5000); await flush(); expect(fetcher.mock.calls.length).toBe(n);
    fetcher.mockImplementation(async () => ({ ok: true, blob: async () => new Blob(['corrupt']) } as Response));
    c.update(input = { ...input, view: view('ready', 2) }); await playRound(2);
    a.onerror?.(); expect(state.status).toBe('unavailable'); expect(a.paused).toBe(true);
    c.update(input = { ...input, view: view('ready', 3) }); await flush();
    a.play.mockImplementation(async () => { throw Object.assign(new Error('fixture'), { name: 'NotAllowedError' }); });
    await playRound(3); expect(state.status).toBe('blocked');
    const plays = a.play.mock.calls.length; vi.advanceTimersByTime(3000); await flush(); expect(a.play).toHaveBeenCalledTimes(plays);
  });

  it('the result effect never plays during the active round (preload only)', async () => {
    c.setEnabled(true); await flush();
    update(activeView(1)); await flush();
    const srcDuringPlay = a.src;
    vi.advanceTimersByTime(20000); await flush();
    expect(a.src).toBe(srcDuringPlay); expect(create.mock.calls.length).toBe(2); // lobby + question only
  });
});
