import { useCallback, useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, ErrorCode, RoomView, ServerToClientEvents } from '../../shared/protocol';
import { estimateOffset, type TimeSample } from '../../shared/timesync';

export type ConnectionStatus = 'connecting' | 'connected' | 'reconnecting' | 'unauthorized';
export type AckResult<T = object> = ({ ok: true } & T) | { ok: false; error: ErrorCode | 'offline'; message?: string };

type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

/**
 * Authenticated connection to a room. The server pushes the full role-specific view on every change,
 * so reconnecting (or refreshing) always restores the authoritative state. Also measures the offset
 * between this device's clock and the server's, used for the countdown.
 */
export function useRoom<V extends RoomView>(auth: { token: string; roomCode?: string } | null) {
  const [view, setView] = useState<V | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>('connecting');
  const [offset, setOffset] = useState(0);
  const socketRef = useRef<GameSocket | null>(null);

  useEffect(() => {
    if (!auth) return;
    setStatus('connecting');
    const socket: GameSocket = io({ auth, transports: ['websocket', 'polling'] });
    socketRef.current = socket;

    const sync = async () => {
      const samples: TimeSample[] = [];
      for (let i = 0; i < 5 && socket.connected; i++) {
        const t0 = Date.now();
        const r = await new Promise<{ t0: number; server: number } | null>((resolve) => {
          socket.timeout(3000).emit('time:sync', t0, (err: Error | null, res: { t0: number; server: number }) => resolve(err ? null : res));
        });
        if (r) samples.push({ t0, server: r.server, t1: Date.now() });
      }
      const best = estimateOffset(samples);
      if (best) setOffset(best.offset);
    };

    socket.on('connect', () => {
      setStatus('connected');
      void sync();
    });
    socket.on('disconnect', (reason) => {
      setStatus('reconnecting');
      // A server-side disconnect (e.g. revoked or expired session) is not retried automatically by
      // Socket.IO: retry once so the server can confirm whether this session is still valid.
      if (reason === 'io server disconnect') socket.connect();
    });
    socket.on('connect_error', (err) => {
      if (err.message === 'unauthorized' || err.message === 'not_found') {
        setStatus('unauthorized');
        socket.disconnect();
      } else setStatus('reconnecting');
    });
    socket.on('state', (v) => setView(v as V));
    const resync = setInterval(() => void sync(), 30_000);
    return () => {
      clearInterval(resync);
      socket.disconnect();
      socketRef.current = null;
    };
  }, [auth?.token, auth?.roomCode]); // eslint-disable-line react-hooks/exhaustive-deps

  const emit = useCallback(
    <T extends object = object>(event: keyof ClientToServerEvents, payload: unknown): Promise<AckResult<T>> =>
      new Promise((resolve) => {
        const socket = socketRef.current;
        if (!socket?.connected) return resolve({ ok: false, error: 'offline' });
        (socket.timeout(5000) as unknown as { emit: (e: string, p: unknown, cb: (err: Error | null, r: AckResult<T>) => void) => void }).emit(
          event,
          payload,
          (err, r) => resolve(err ? { ok: false, error: 'offline' } : r),
        );
      }),
    [],
  );

  return { view, status, offset, emit };
}

/** Re-render every `interval` ms while `active`, returning the estimated server time. */
export function useServerNow(offset: number, active: boolean, interval = 200): number {
  const [now, setNow] = useState(() => Date.now() + offset);
  useEffect(() => {
    setNow(Date.now() + offset);
    if (!active) return;
    const id = setInterval(() => setNow(Date.now() + offset), interval);
    return () => clearInterval(id);
  }, [offset, active, interval]);
  return now;
}
