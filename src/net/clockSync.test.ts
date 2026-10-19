import { describe, expect, it } from 'vitest';
import { measureOffset } from './clockSync';

/** Simulated network: the server clock is `serverOffset` ahead of the client; each ping has a delay. */
function net(serverOffset: number, delays: (number | null)[]) {
  let clientNow = 1_000_000;
  let i = 0;
  return {
    now: () => clientNow,
    ping: async () => {
      const d = delays[i++ % delays.length] ?? null;
      if (d === null) {
        clientNow += 3_000; // timed out
        return null;
      }
      clientNow += d / 2;
      const server = clientNow + serverOffset;
      clientNow += d / 2;
      return { server };
    },
  };
}

describe('measureOffset', () => {
  it('client clock behind the server', async () => {
    const n = net(+120_000, [40, 30, 50, 30, 60]);
    expect(await measureOffset(n.ping, { now: n.now })).toEqual({ offset: 120_000, rtt: 30 });
  });

  it('client clock ahead of the server', async () => {
    const n = net(-3_600_000, [20, 20, 20, 20, 20]);
    expect((await measureOffset(n.ping, { now: n.now }))!.offset).toBe(-3_600_000);
  });

  it('a delayed reply (high jitter) does not win over a fast one', async () => {
    const n = net(5_000, [2_500, 40, 1_800, null, 900]);
    expect(await measureOffset(n.ping, { now: n.now })).toEqual({ offset: 5_000, rtt: 40 });
  });

  it('all pings lost → null (keep the previous offset)', async () => {
    const n = net(5_000, [null]);
    expect(await measureOffset(n.ping, { now: n.now })).toBeNull();
  });

  it('a measurement racing with unmount/reconnect is discarded', async () => {
    const n = net(5_000, [10, 10, 10, 10, 10]);
    let active = true;
    let replies = 0;
    const result = await measureOffset(
      async (t0) => {
        const r = await n.ping();
        if (++replies === 2) active = false; // unmounted while the 2nd reply was in flight
        void t0;
        return r;
      },
      { now: n.now, isActive: () => active },
    );
    expect(result).toBeNull();
  });
});
