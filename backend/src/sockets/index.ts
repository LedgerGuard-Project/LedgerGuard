import type { Server as HttpServer } from 'http';
import { Server } from 'socket.io';
import { config } from '../config';
import { verifyAccessToken } from '../security/jwt';
import { logger } from '../utils/logger';

export interface SocketContext {
  userId: string;
}

/**
 * Real-time layer. Clients emit/join rooms scoped to their user id so they
 * only receive events for their own data (e.g. "ledger:updated").
 */
export function attachSockets(httpServer: HttpServer): Server {
  const io = new Server(httpServer, {
    cors: { origin: config.corsOrigin.split(',').map((s) => s.trim()) },
  });

  io.use((socket, next) => {
    try {
      const token = (socket.handshake.auth?.token as string) ?? (socket.handshake.headers.authorization?.replace('Bearer ', '') as string);
      if (!token) return next(new Error('AUTH_TOKEN_REQUIRED'));
      const payload = verifyAccessToken(token);
      (socket as unknown as { data: SocketContext }).data = { userId: payload.sub };
      next();
    } catch {
      next(new Error('AUTH_INVALID'));
    }
  });

  io.on('connection', (socket) => {
    const ctx = (socket as unknown as { data: SocketContext }).data;
    void socket.join(`user:${ctx.userId}`);
    logger.info(`Socket connected: user=${ctx.userId} socket=${socket.id}`);
    socket.on('disconnect', () => {
      logger.info(`Socket disconnected: ${socket.id}`);
    });
  });

  return io;
}

/** Emit a ledger change to a specific user's real-time channel. */
export function emitLedgerEvent(io: Server, userId: string, event: string, payload: unknown): void {
  io.to(`user:${userId}`).emit(event, payload);
}