import type { Server as HttpServer } from 'http';
import { Server } from 'socket.io';
import { config } from '../config';
import { verifyAccessToken } from '../security/jwt';
import { setIo } from './eventBus';
import { logger } from '../utils/logger';

export interface SocketContext {
  userId: string;
  tenantId: string;
}

/**
 * Real-time layer. Clients are placed in a per-user room and a per-tenant room
 * (`tenant:{tenantId}`) so financial events can be scoped to the tenant and
 * never leak across organizations.
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
      (socket as unknown as { data: SocketContext }).data = {
        userId: payload.sub,
        tenantId: payload.tenantId,
      };
      next();
    } catch {
      next(new Error('AUTH_INVALID'));
    }
  });

  io.on('connection', (socket) => {
    const ctx = (socket as unknown as { data: SocketContext }).data;
    void socket.join(`user:${ctx.userId}`);
    void socket.join(`tenant:${ctx.tenantId}`);
    logger.info(`Socket connected: user=${ctx.userId} tenant=${ctx.tenantId} socket=${socket.id}`);
    socket.on('disconnect', () => {
      logger.info(`Socket disconnected: ${socket.id}`);
    });
  });

  setIo(io);
  return io;
}