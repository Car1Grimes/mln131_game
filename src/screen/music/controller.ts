import type { ScreenView } from '../../../shared/protocol';

export type MusicStatus = 'off' | 'waiting' | 'loading' | 'playing' | 'blocked' | 'unavailable' | 'ended';
export interface MusicState { enabled: boolean; status: MusicStatus }
export interface MusicInput {
  view: ScreenView | null;
  connected: boolean;
  offset: number;
  experienceRound: string | null;
}
interface Target { key: string; url: string; loop: boolean; startedAt?: number; deadlineAt?: number; intro?: boolean }
interface Dependencies {
  now: () => number;
  fetch: typeof fetch;
  createUrl: (blob: Blob) => string;
  revokeUrl: (url: string) => void;
}

/** One element for this ScreenRoom's lifetime. No dependency on scene ids/submission counts. */
export class ProjectorMusicController {
  private input: MusicInput = { view: null, connected: false, offset: 0, experienceRound: null };
  private state: MusicState = { enabled: false, status: 'off' };
  private target: Target | null = null;
  private generation = 0;
  private abort: AbortController | null = null;
  private objectUrl: string | null = null;
  private disposed = false;
  private awaitingFreshView: ScreenView | null = null;
  private readonly interval: ReturnType<typeof setInterval>;
  private deadline: ReturnType<typeof setTimeout> | null = null;
  private playPending = false;
  /** Generic intro effect (identical for every question), preloaded while waiting so its start is not lost. */
  private introBlob: Blob | null = null;
  private introPreload: AbortController | null = null;
  private introPreloadKey: string | null = null;
  private readonly deps: Dependencies;

  constructor(private readonly audio: HTMLAudioElement, private readonly notify: (state: MusicState) => void, deps: Partial<Dependencies> = {}) {
    this.deps = { now: () => Date.now(), fetch: (...args) => fetch(...args), createUrl: (b) => URL.createObjectURL(b), revokeUrl: (u) => URL.revokeObjectURL(u), ...deps };
    audio.preload = 'none';
    this.interval = setInterval(() => this.tick(), 100);
  }

  update(input: MusicInput): void {
    if (this.disposed) return;
    if (!input.connected) this.awaitingFreshView = input.view;
    this.input = input;
    this.reconcile();
  }

  /** Called directly in the operator's click handler, never persisted across page refresh. */
  setEnabled(enabled: boolean): void {
    if (this.disposed) return;
    // OFF drops the preloaded effect too: ON always re-reads the current server file.
    if (!enabled) this.dropIntroPreload();
    this.state = { ...this.state, enabled };
    this.reconcile();
  }

  private publish(status: MusicStatus): void {
    if (this.state.status === status) return;
    this.state = { ...this.state, status };
    this.notify({ ...this.state });
  }

  private desired(): Target | null {
    const { view, connected, experienceRound } = this.input;
    if (!this.state.enabled || !view || !connected || view === this.awaitingFreshView) return null;
    const base = `/api/screen/rooms/${encodeURIComponent(view.room.code)}/music/`;
    if (view.room.phase === 'lobby' || view.room.phase === 'finished') {
      return { key: `${view.room.code}:${view.room.phase}`, url: base + 'lobby', loop: true };
    }
    const now = this.serverNow();
    // Intro: the effect plays once, aligned to the server's intro start, and is cut at the active start.
    const intro = view.intro;
    if (view.room.phase === 'intro') {
      if (!intro || now >= intro.startsAt) return null;
      return { key: `${view.room.code}:intro:${intro.startsAt}`, url: base + 'intro', loop: false, startedAt: intro.introStartedAt, deadlineAt: intro.startsAt, intro: true };
    }
    const r = view.round;
    if (view.room.phase !== 'active' || !r || experienceRound !== r.id || now < r.startedAt || now >= r.deadlineAt) return null;
    return { key: `${view.room.code}:${r.id}`, url: base + `question?roundId=${encodeURIComponent(r.id)}`, loop: false, startedAt: r.startedAt, deadlineAt: r.deadlineAt };
  }

  private serverNow(): number { return this.deps.now() + this.input.offset; }

  private reconcile(): void {
    const next = this.desired();
    if (next?.key !== this.target?.key || (!next && this.target)) {
      this.clearTrack();
      this.target = next;
      if (next) void this.load(next, this.generation);
    }
    // Always publish enabled changes, including toggles during silent phases.
    if (!next) this.state = { ...this.state, status: this.state.enabled ? 'waiting' : 'off' };
    this.notify({ ...this.state });
    this.armDeadline();
    this.preloadIntro();
    this.tick();
  }

  /** Once per lobby/ready phase while enabled: fetch the generic intro effect (no question data). */
  private preloadIntro(): void {
    const { view, connected } = this.input;
    const waiting = view !== null && (view.room.phase === 'lobby' || view.room.phase === 'ready');
    const key = waiting ? `${view.room.code}:${view.room.phase}:${view.room.questionIndex}` : null;
    // A request still pending when its waiting phase ends is abandoned (the intro fetches on its own).
    if (this.introPreload && this.introPreloadKey !== key) { this.introPreload.abort(); this.introPreload = null; }
    if (!this.state.enabled || !connected || !view || !key || this.introBlob || this.introPreload) return;
    if (this.introPreloadKey === key) return; // one attempt per waiting phase: no retry storm
    this.introPreloadKey = key;
    const abort = new AbortController();
    this.introPreload = abort;
    const url = `/api/screen/rooms/${encodeURIComponent(view.room.code)}/music/intro`;
    void this.deps.fetch(url, { headers: { authorization: `Bearer ${this.token}` }, signal: abort.signal, cache: 'no-store', credentials: 'omit' })
      .then(async (response) => {
        if (!response.ok) return;
        const blob = await response.blob();
        if (!abort.signal.aborted && !this.disposed) this.introBlob = blob;
      })
      .catch(() => { /* optional: the intro itself retries once and reports the state */ })
      .finally(() => { if (this.introPreload === abort) this.introPreload = null; });
  }

  private dropIntroPreload(): void {
    this.introPreload?.abort();
    this.introPreload = null;
    this.introPreloadKey = null;
    this.introBlob = null;
  }

  private armDeadline(): void {
    if (this.deadline !== null) clearTimeout(this.deadline);
    this.deadline = null;
    if (this.target?.deadlineAt !== undefined) {
      this.deadline = setTimeout(() => this.reconcile(), Math.max(0, this.target.deadlineAt - this.serverNow()));
    }
  }

  private async load(target: Target, generation: number): Promise<void> {
    this.publish('loading');
    const abort = new AbortController();
    this.abort = abort;
    try {
      // Token comes only from ScreenRoom; no query-string credentials or shared cache. Only the generic
      // intro effect is ever prefetched (preloadIntro); question audio is never fetched early.
      let blob = target.intro ? this.introBlob : null;
      if (!blob) {
        const response = await this.deps.fetch(target.url, { headers: { authorization: `Bearer ${this.token}` }, signal: abort.signal, cache: 'no-store', credentials: 'omit' });
        if (!response.ok) throw new Error('music unavailable');
        blob = await response.blob();
        if (target.intro && this.valid(generation)) this.introBlob = blob;
      }
      if (!this.valid(generation)) return;
      // Re-evaluate deadline/phase after the asynchronous fetch before creating a resource.
      if (this.desired()?.key !== target.key) { this.reconcile(); return; }
      const url = this.deps.createUrl(blob);
      this.objectUrl = url;
      this.audio.loop = target.loop;
      this.audio.onloadedmetadata = () => this.start(generation);
      this.audio.oncanplay = () => this.start(generation);
      this.audio.onseeked = () => this.start(generation);
      this.audio.onplaying = () => { if (this.valid(generation)) this.publish('playing'); };
      this.audio.onwaiting = () => { if (this.valid(generation)) this.publish('loading'); };
      this.audio.onended = () => { if (this.valid(generation) && !target.loop) { this.audio.pause(); this.publish('ended'); } };
      this.audio.onerror = () => {
        if (!this.valid(generation)) return;
        if (target.intro) this.introBlob = null; // undecodable: fetch the file again next time
        this.audio.pause();
        this.publish('unavailable');
      };
      this.audio.src = url;
      this.audio.load();
    } catch {
      if (this.valid(generation) && !abort.signal.aborted) { this.audio.pause(); this.publish('unavailable'); }
    }
  }

  // Session lifetime is the owning component's lifetime. A re-pair remounts the owner.
  token = '';

  private valid(generation: number): boolean { return !this.disposed && generation === this.generation; }

  private start(generation: number): void {
    if (!this.valid(generation) || !this.target || ['blocked', 'unavailable', 'ended'].includes(this.state.status)) return;
    if (this.desired()?.key !== this.target.key) { this.reconcile(); return; }
    const a = this.audio;
    if (a.readyState < 1 || !Number.isFinite(a.duration) || a.duration <= 0 || a.seeking) return;
    const position = this.target.startedAt === undefined ? null : Math.max(0, (this.serverNow() - this.target.startedAt) / 1000);
    if (position !== null) {
      if (position >= a.duration) { a.pause(); this.publish('ended'); return; }
      if (Math.abs(a.currentTime - position) > 0.35) {
        a.currentTime = position;
        if (a.seeking) return; // Never play the beginning before the aligned seek completes.
      }
    }
    if (!a.paused || this.playPending || a.readyState < 2) return;
    this.playPending = true;
    void a.play().then(() => {
      if (!this.valid(generation)) return;
      this.playPending = false;
      // An async play() may resolve after a deadline or phase switch.
      if (this.desired()?.key !== this.target?.key) this.reconcile();
    }, (error: unknown) => {
      if (!this.valid(generation)) return;
      this.playPending = false;
      a.pause();
      this.publish((error as { name?: string })?.name === 'NotAllowedError' ? 'blocked' : 'unavailable');
    });
  }

  private tick(): void {
    if (this.disposed) return;
    if (this.target && this.desired()?.key !== this.target.key) { this.reconcile(); return; }
    if (this.objectUrl) this.start(this.generation);
  }

  private clearTrack(): void {
    this.generation++;
    this.abort?.abort(); this.abort = null;
    if (this.deadline !== null) clearTimeout(this.deadline);
    this.deadline = null;
    this.playPending = false;
    const a = this.audio;
    a.pause();
    a.onloadedmetadata = a.oncanplay = a.onseeked = a.onplaying = a.onwaiting = a.onended = a.onerror = null;
    a.removeAttribute('src'); a.load();
    if (this.objectUrl) this.deps.revokeUrl(this.objectUrl);
    this.objectUrl = null;
    this.target = null;
  }

  dispose(): void {
    this.disposed = true;
    clearInterval(this.interval);
    this.dropIntroPreload();
    this.clearTrack();
  }
}
