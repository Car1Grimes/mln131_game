// TCP-level network impairment proxy for tests. Sits between clients and the server, so it affects
// HTTP *and* WebSocket traffic identically (unlike browser DevTools throttling).
//
// Supports: latency + jitter (order-preserving), bandwidth limit, frozen network (traffic held
// until released, like a stalled Wi-Fi link), dropping the server→client direction (lost replies),
// and cutting every connection (abrupt disconnect). True IP packet loss is NOT simulated (TCP would
// retransmit it anyway; reproducing it needs root-level tools such as dummynet).
import net from 'node:net';

export async function createProxy(targetPort, initial = {}) {
  let cond = { latencyMs: 0, jitterMs: 0, bytesPerSecond: 0, frozen: false, dropDownstream: false, ...initial };
  const conns = new Set();
  const stats = { connections: 0, upBytes: 0, downBytes: 0, droppedDownBytes: 0 };

  function lane(dest, direction) {
    let readyAt = 0; // keeps chunks in order despite jitter
    const held = [];
    // Delivery queue drained by ONE timer, strictly in order. (One setTimeout per chunk could
    // reorder chunks: timers are scheduled from the event loop's cached clock, so under load a
    // later chunk's timer could fire first — a response body then overtook its HTTP headers.)
    const queue = [];
    let timer = null;
    let ended = false;
    const maybeEnd = () => {
      if (ended && queue.length === 0 && held.length === 0 && !dest.destroyed) dest.end();
    };
    const flush = () => {
      timer = null;
      const now = Date.now();
      while (queue.length && queue[0].at <= now) {
        const { chunk } = queue.shift();
        if (!dest.destroyed) dest.write(chunk);
      }
      maybeEnd();
      schedule();
    };
    const schedule = () => {
      if (timer || !queue.length) return;
      timer = setTimeout(flush, Math.max(0, queue[0].at - Date.now()));
    };
    const send = (chunk) => {
      const now = Date.now();
      const jitter = cond.jitterMs ? Math.random() * cond.jitterMs : 0;
      const tx = cond.bytesPerSecond ? (chunk.length / cond.bytesPerSecond) * 1000 : 0;
      readyAt = Math.max(readyAt, now + cond.latencyMs + jitter) + tx;
      queue.push({ at: readyAt, chunk });
      if (readyAt <= now && queue.length === 1 && !timer) flush();
      else schedule();
    };
    return {
      /** Source finished: half-close the destination once everything queued has been delivered. */
      end() {
        ended = true;
        maybeEnd();
      },
      push(chunk) {
        if (direction === 'down' && cond.dropDownstream) {
          stats.droppedDownBytes += chunk.length;
          return;
        }
        if (direction === 'up') stats.upBytes += chunk.length;
        else stats.downBytes += chunk.length;
        if (cond.frozen) held.push(chunk);
        else send(chunk);
      },
      release() {
        while (held.length) send(held.shift());
      },
    };
  }

  const server = net.createServer({ allowHalfOpen: true }, (client) => {
    stats.connections++;
    const upstream = net.connect({ port: targetPort, host: '127.0.0.1', allowHalfOpen: true });
    const up = lane(upstream, 'up');
    const down = lane(client, 'down');
    const conn = { client, upstream, up, down };
    conns.add(conn);
    client.on('data', (c) => up.push(c));
    upstream.on('data', (c) => down.push(c));
    // Graceful end: forward the half-close after the delayed data (no truncation).
    client.on('end', () => up.end());
    upstream.on('end', () => down.end());
    const destroy = () => {
      conns.delete(conn);
      client.destroy();
      upstream.destroy();
    };
    client.on('close', () => (upstream.writableEnded ? destroy() : undefined));
    upstream.on('close', () => (client.writableEnded ? destroy() : undefined));
    client.on('error', destroy);
    upstream.on('error', destroy);
    conn.destroy = destroy;
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

  return {
    port: server.address().port,
    stats,
    get conditions() {
      return { ...cond };
    },
    set(next) {
      const wasFrozen = cond.frozen;
      cond = { ...cond, ...next };
      if (wasFrozen && !cond.frozen) for (const c of conns) (c.up.release(), c.down.release());
    },
    /** Abruptly close every open connection (clients will see a transport error). */
    cut() {
      for (const c of conns) c.destroy();
    },
    async close() {
      this.cut();
      await new Promise((resolve) => server.close(() => resolve()));
    },
  };
}
