import type { Server } from 'socket.io';

/**
 * Holds the Socket.IO server reference so business services can emit
 * tenant-scoped real-time events without a direct server dependency.
 */
let io: Server | null = null;

export function setIo(server: Server): void {
  io = server;
}

export function isSocketsReady(): boolean {
  return io !== null;
}

/** Direct server reference for observability (health checks). Null before attach. */
export function getIo(): Server | null {
  return io;
}

/** Emit to everyone inside a tenant room — financial events never leave the tenant. */
export function emitTenantEvent(tenantId: string, event: string, payload: unknown): void {
  if (!io) return;
  io.to(`tenant:${tenantId}`).emit(event, payload);
}

/** Emit to a single user's room (e.g. targeted notifications). */
export function emitUserEvent(userId: string, event: string, payload: unknown): void {
  if (!io) return;
  io.to(`user:${userId}`).emit(event, payload);
}
