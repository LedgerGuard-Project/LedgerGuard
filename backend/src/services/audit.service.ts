import { AuditAction, type AuditLogEntry } from '@ledgerguard/shared';
import { AuditLogModel } from '../models/AuditLog';

export interface AuditInput {
  tenantId: string;
  actorId?: string;
  actorEmail?: string;
  action: AuditAction;
  resource: string;
  resourceId?: string;
  details?: Record<string, unknown>;
  ip?: string;
  userAgent?: string;
}

/**
 * Persist an audit event. Writes to the platform-wide audit log for a unified,
 * cross-tenant compliance trail.
 */
export async function writeAudit(input: AuditInput): Promise<AuditLogEntry> {
  const doc = await AuditLogModel.create(input);
  return doc.toJSON() as unknown as AuditLogEntry;
}

/** Gated helper that records an event when a valid request context is present. */
export function auditFromRequest(
  ctx: { tenantId: string; authUser?: { id: string; email: string } },
  input: Omit<AuditInput, 'tenantId' | 'actorId' | 'actorEmail'>,
  req?: { ip?: string; get?: (h: string) => string | undefined },
): Promise<AuditLogEntry> | null {
  const actorId = ctx.authUser?.id;
  const actorEmail = ctx.authUser?.email;
  if (!actorId) return null;
  return writeAudit({
    ...input,
    tenantId: ctx.tenantId,
    actorId,
    actorEmail,
    ip: req?.ip,
    userAgent: req?.get?.('user-agent'),
  });
}