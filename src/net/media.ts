import { useEffect, useState } from 'react';

/**
 * Authenticated media loader. <img>/<video> cannot send an Authorization header, so media is fetched
 * with the session token and rendered from a Blob URL. Object URLs are revoked when the cache is
 * disposed (round change or unmount). Nothing is ever prefetched: the client only knows released assets.
 */
export class MediaCache {
  private readonly entries = new Map<string, Promise<string>>();
  private readonly objectUrls: string[] = [];
  private disposed = false;

  constructor(private readonly token: string) {}

  load(url: string): Promise<string> {
    let entry = this.entries.get(url);
    if (!entry) {
      entry = this.fetchWithRetry(url).catch((err) => {
        this.entries.delete(url); // allow a later retry
        throw err;
      });
      this.entries.set(url, entry);
    }
    return entry;
  }

  private async fetchWithRetry(url: string, attempts = 3): Promise<string> {
    for (let i = 0; ; i++) {
      try {
        const res = await fetch(url, { headers: { authorization: `Bearer ${this.token}` }, cache: 'no-store', credentials: 'omit' });
        // 401/403 are final: the server decides what is released; never retry into the future.
        if (!res.ok) throw Object.assign(new Error(`media ${res.status}`), { final: res.status === 401 || res.status === 403 });
        const blob = await res.blob();
        if (this.disposed) throw new Error('disposed');
        const objectUrl = URL.createObjectURL(blob);
        this.objectUrls.push(objectUrl);
        return objectUrl;
      } catch (err) {
        if ((err as { final?: boolean }).final || this.disposed || i + 1 >= attempts) throw err;
        await new Promise((r) => setTimeout(r, 400 * (i + 1)));
      }
    }
  }

  dispose(): void {
    this.disposed = true;
    for (const u of this.objectUrls) URL.revokeObjectURL(u);
    this.objectUrls.length = 0;
    this.entries.clear();
  }
}

/** One cache per round and session; disposed (URLs revoked) when either changes. */
export function useMediaCache(token: string, roundId: string): MediaCache | null {
  const [cache, setCache] = useState<MediaCache | null>(null);
  useEffect(() => {
    const c = new MediaCache(token);
    setCache(c);
    return () => c.dispose();
  }, [token, roundId]);
  return cache;
}

export function useMedia(cache: MediaCache | null, url: string | null): { src: string | null; failed: boolean } {
  const [state, setState] = useState<{ src: string | null; failed: boolean }>({ src: null, failed: false });
  useEffect(() => {
    setState({ src: null, failed: false });
    if (!cache || !url) return;
    let cancelled = false;
    cache.load(url).then(
      (src) => !cancelled && setState({ src, failed: false }),
      () => !cancelled && setState({ src: null, failed: true }),
    );
    return () => {
      cancelled = true;
    };
  }, [cache, url]);
  return state;
}
