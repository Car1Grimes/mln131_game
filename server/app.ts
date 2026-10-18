import express, { type NextFunction, type Request, type Response } from 'express';
import { existsSync } from 'node:fs';
import { createServer, type Server as HttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { Server as IoServer, type Socket } from 'socket.io';
import type { Ack, ClientToServerEvents, ServerToClientEvents } from '../shared/protocol';
import { RateLimiter, hashToken, newToken, passwordMatches } from './auth';
import { QUESTIONS, type ServerQuestion } from './content/questions';
import { openDb, type Db, type SessionRow } from './db';
import { GameEngine, GameError, type Clock, type Scheduler } from './engine';
import { MediaRegistry } from './media/registry';
import { adminView, teamView } from './views';

export interface AppOptions {
  dbPath: string;
  adminPassword: string;
  roundDurationMs: number;
  staticDir?: string | null;
  questions?: readonly ServerQuestion[];
  clock?: Clock;
  scheduler?: Scheduler;
  /** Login/join attempts per IP per window. */
  authLimit?: { attempts: number; windowMs: number };
  /** Server-only media registry (default: server/media). */
  media?: MediaRegistry;
}

interface SocketData {
  role: 'admin' | 'team';
  roomId: string;
  teamId: string | null;
}
type GameSocket = Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;

export interface RunningApp {
  url: string;
  port: number;
  engine: GameEngine;
  db: Db;
  close(): Promise<void>;
}

export async function startApp(opts: AppOptions, port = 0, host = '127.0.0.1'): Promise<RunningApp> {
  const db = openDb(opts.dbPath);
  const limits = opts.authLimit ?? { attempts: 10, windowMs: 5 * 60_000 };
  const loginLimiter = new RateLimiter(limits.attempts, limits.windowMs);
  const joinLimiter = new RateLimiter(limits.attempts, limits.windowMs);
  const roomJoinLimiter = new RateLimiter(limits.attempts * 5, limits.windowMs);

  const presence = new Map<string, Set<string>>(); // teamId -> socket ids
  const devices = (teamId: string) => presence.get(teamId)?.size ?? 0;

  let io: IoServer<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData> | null = null;
  const broadcast = (roomId: string) => {
    if (!io) return;
    io.to(`admin:${roomId}`).emit('state', adminView(engine, roomId, { devices }));
    for (const team of engine.teams(roomId)) io.to(`team:${team.id}`).emit('state', teamView(engine, roomId, team.id));
  };

  const registry = opts.media ?? new MediaRegistry();
  const missing = registry.missingFiles();
  if (missing.length) throw new Error(`media files missing for assets: ${missing.join(', ')}`);
  const mediaLimiter = new RateLimiter(600, 60_000);

  const engine = new GameEngine(db, {
    registry,
    questions: opts.questions ?? QUESTIONS,
    roundDurationMs: opts.roundDurationMs,
    clock: opts.clock,
    scheduler: opts.scheduler,
    onChange: broadcast,
  });

  const createSession = (s: Omit<SessionRow, 'token_hash' | 'created_at'>) => {
    const token = newToken();
    db.insertSession({ ...s, token_hash: hashToken(token), created_at: engine.now() });
    return token;
  };
  const sessionFrom = (token: unknown) => (typeof token === 'string' && token.length < 200 ? db.sessionByHash(hashToken(token)) : undefined);

  // ---------------------------------------------------------------- HTTP
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '4kb' }));
  app.use('/api', (_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });

  const tooMany = (res: Response, limiter: RateLimiter, key: string) => {
    res.set('Retry-After', String(Math.ceil(limiter.retryAfterMs(key) / 1000)));
    res.status(429).json({ error: 'rate_limited' });
  };

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.post('/api/admin/login', (req, res) => {
    const key = req.ip ?? 'unknown';
    if (!loginLimiter.attempt(key)) return tooMany(res, loginLimiter, key);
    if (typeof req.body?.password !== 'string' || !passwordMatches(req.body.password, opts.adminPassword)) {
      return res.status(401).json({ error: 'unauthorized' });
    }
    loginLimiter.reset(key);
    res.json({ token: createSession({ role: 'admin', room_id: null, team_id: null }) });
  });

  const requireAdmin = (req: Request, res: Response, next: NextFunction) => {
    const token = req.get('authorization')?.replace(/^Bearer /, '');
    if (sessionFrom(token)?.role !== 'admin') return void res.status(401).json({ error: 'unauthorized' });
    next();
  };

  app.post('/api/admin/rooms', requireAdmin, (_req, res) => {
    const { room } = engine.createRoom();
    res.status(201).json({ code: room.code });
  });

  app.get('/api/admin/rooms', requireAdmin, (_req, res) => {
    res.json(db.listRooms().map((r) => ({ code: r.code, phase: r.phase, createdAt: r.created_at })));
  });

  app.post('/api/join', (req, res) => {
    const ipKey = req.ip ?? 'unknown';
    const code = typeof req.body?.code === 'string' ? req.body.code.trim().toUpperCase() : '';
    const pin = typeof req.body?.pin === 'string' ? req.body.pin.trim() : '';
    if (!joinLimiter.attempt(ipKey)) return tooMany(res, joinLimiter, ipKey);
    if (!roomJoinLimiter.attempt(`room:${code}`)) return tooMany(res, roomJoinLimiter, `room:${code}`);
    const room = /^[A-Z0-9]{4,8}$/.test(code) ? db.roomByCode(code) : undefined;
    const team = room && /^\d{6}$/.test(pin) ? db.teamByPin(room.id, pin) : undefined;
    if (!room || !team) return res.status(401).json({ error: 'unauthorized' }); // same reply for code and PIN
    joinLimiter.reset(ipKey);
    res.json({ token: createSession({ role: 'team', room_id: room.id, team_id: team.id }), teamName: team.name, code: room.code });
  });

  /**
   * Authenticated media for released scenes. Fetched by the client with an Authorization header and
   * rendered from a Blob URL. Every refusal (unknown round, other room, unknown asset, not yet
   * released, malformed ids) is the same 403, so hidden scenes cannot be probed.
   */
  app.get('/api/rounds/:roundId/media/:assetId', (req, res) => {
    const token = req.get('authorization')?.replace(/^Bearer /, '');
    const session = sessionFrom(token);
    if (!session) return void res.status(401).json({ error: 'unauthorized' });
    if (!mediaLimiter.attempt(session.token_hash)) return tooMany(res, mediaLimiter, session.token_hash);
    const { roundId, assetId } = req.params;
    const forbidden = () => res.status(403).json({ error: 'forbidden' });
    if (!/^[\w-]{8,40}$/.test(roundId) || !/^[a-z0-9-]{3,40}$/.test(assetId)) return void forbidden();
    const asset = engine.authorizeMedia(roundId, assetId, { role: session.role, roomId: session.room_id });
    if (!asset) return void forbidden();
    const file = registry.resolveFile(asset);
    if (!file) {
      console.error(`media file unavailable for asset ${asset.id}`);
      return void res.status(500).json({ error: 'unavailable' });
    }
    res.sendFile(file, {
      dotfiles: 'deny',
      etag: false,
      lastModified: false,
      cacheControl: false,
      acceptRanges: true,
      headers: {
        'Content-Type': asset.mime,
        'Cache-Control': 'private, no-store, max-age=0',
        'X-Content-Type-Options': 'nosniff',
        'Content-Disposition': 'inline',
        'Cross-Origin-Resource-Policy': 'same-origin',
      },
    });
  });

  // Unknown /api routes: JSON 404 (never the SPA fallback).
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'not_found' });
  });

  if (opts.staticDir && existsSync(opts.staticDir)) {
    const dir = opts.staticDir;
    app.use(express.static(dir, { index: false }));
    app.get(/^\/(?!api\/|socket\.io\/).*/, (_req, res) => res.sendFile(join(dir, 'index.html')));
  }

  // ---------------------------------------------------------------- Socket.IO
  const http: HttpServer = createServer(app);
  io = new IoServer(http, { serveClient: false, maxHttpBufferSize: 8_000 });

  io.use((socket, next) => {
    const session = sessionFrom(socket.handshake.auth?.token);
    if (!session) return next(new Error('unauthorized'));
    if (session.role === 'team' && session.room_id && session.team_id) {
      socket.data = { role: 'team', roomId: session.room_id, teamId: session.team_id };
      return next();
    }
    if (session.role === 'admin') {
      const code = typeof socket.handshake.auth?.roomCode === 'string' ? socket.handshake.auth.roomCode.toUpperCase() : '';
      const room = db.roomByCode(code);
      if (!room) return next(new Error('not_found'));
      socket.data = { role: 'admin', roomId: room.id, teamId: null };
      return next();
    }
    next(new Error('unauthorized'));
  });

  io.on('connection', (socket: GameSocket) => {
    const { role, roomId, teamId } = socket.data;
    const eventLimiter = new RateLimiter(30, 10_000);

    if (role === 'admin') {
      void socket.join(`admin:${roomId}`);
    } else if (teamId) {
      void socket.join(`team:${teamId}`);
      const set = presence.get(teamId) ?? new Set();
      set.add(socket.id);
      presence.set(teamId, set);
    }
    broadcast(roomId);

    /** Wraps a handler: per-socket rate limit, role check, payload check, GameError → ack. */
    const handle =
      <P, R extends object>(needRole: 'admin' | 'team' | 'any', fn: (payload: P) => R | void) =>
      (payload: P, ack: Ack<R>) => {
        if (typeof ack !== 'function') return;
        if (!eventLimiter.attempt('e')) return ack({ ok: false, error: 'rate_limited' });
        if (needRole !== 'any' && role !== needRole) return ack({ ok: false, error: 'forbidden' });
        if (payload !== undefined && (typeof payload !== 'object' || payload === null)) return ack({ ok: false, error: 'invalid' });
        try {
          const result = fn(payload ?? ({} as P));
          ack({ ok: true, ...((result ?? {}) as R) });
        } catch (err) {
          if (err instanceof GameError) ack({ ok: false, error: err.code, message: err.message });
          else {
            console.error(err);
            ack({ ok: false, error: 'invalid' });
          }
        }
      };

    socket.on('time:sync', (t0, ack) => {
      if (typeof ack === 'function') ack({ t0: Number(t0) || 0, server: engine.now() });
    });

    socket.on('team:ready', handle<{ ready: boolean }, object>('team', (p) => engine.setReady(roomId, teamId!, p.ready === true)));

    // The team id comes from the authenticated session; any team id in the payload is ignored.
    socket.on(
      'team:submit',
      handle<{ submissionId: string; answer: string }, { receivedAt: number; duplicate: boolean }>('team', (p) =>
        engine.submit(roomId, teamId!, p.submissionId, p.answer),
      ),
    );

    socket.on('admin:rename', handle<{ teamId: string; name: string }, object>('admin', (p) => engine.rename(roomId, String(p.teamId), String(p.name))));
    socket.on('admin:start', handle<Record<string, never>, object>('admin', () => void engine.startRound(roomId)));
    socket.on('admin:advance', handle<Record<string, never>, object>('admin', () => engine.advance(roomId)));

    socket.on('disconnect', () => {
      if (teamId) {
        presence.get(teamId)?.delete(socket.id);
        if (presence.get(teamId)?.size === 0) presence.delete(teamId);
      }
      try {
        broadcast(roomId);
      } catch {
        /* room may be gone during shutdown */
      }
    });
  });

  engine.recover();

  await new Promise<void>((resolve) => http.listen(port, host, resolve));
  const address = http.address() as AddressInfo;
  return {
    url: `http://${host}:${address.port}`,
    port: address.port,
    engine,
    db,
    async close() {
      engine.dispose();
      await new Promise<void>((resolve) => io!.close(() => resolve()));
      db.close();
    },
  };
}
