import type { Response } from 'express';
import { AuditAction, SOCKET_EVENTS } from '@ledgerguard/shared';
import type { AuthenticatedRequest } from '../../types';
import { asyncHandler } from '../../utils/asyncHandler';
import {
  createDebitNote,
  issueDebitNote,
  cancelDebitNote,
  listDebitNotes,
} from '../../services/billing/debitNote.service';
import { serializeDebitNote } from '../../services/billing/serializers';
import { writeAudit } from '../../services/audit.service';
import { emitTenantEvent } from '../../sockets/eventBus';
import { generateIdempotencyKey } from '../../services/idempotency.service';

function idempotencyKeyFrom(req: AuthenticatedRequest): string {
  const header = req.headers['idempotency-key'];
  const value = Array.isArray(header) ? header[0] : header;
  if (value && typeof value === 'string' && value.trim().length > 0) return value.trim().slice(0, 200);
  return generateIdempotencyKey();
}

export const create = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const models = req.tc!.models.billing;
  const tenantId = req.tc!.tenant.tenantId;
  const note = await createDebitNote(models, tenantId, req.body);
  await writeAudit({
    tenantId,
    actorId: req.authUser!.id,
    actorEmail: req.authUser!.email,
    action: AuditAction.DebitNoteCreated,
    resource: 'debit_note',
    resourceId: note.debitNoteId,
    details: { debitNoteNumber: note.debitNoteNumber, totalMinor: note.totalMinor },
    ip: req.ip,
    userAgent: req.get('user-agent'),
  });
  emitTenantEvent(tenantId, SOCKET_EVENTS.debitNoteCreated, { debitNoteId: note.debitNoteId, status: note.status });
  res.status(201).json({ success: true, data: { debitNote: serializeDebitNote(note) } });
});

export const issue = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const key = idempotencyKeyFrom(req);
  const result = await issueDebitNote(
    req.tc!.connection,
    req.tc!.models.billing,
    req.tc!.tenant.tenantId,
    { id: req.authUser!.id, email: req.authUser!.email },
    req.params.debitNoteId,
    { idempotencyKey: key },
    { ip: req.ip, userAgent: req.get('user-agent') },
  );
  res.json({ success: true, data: result });
});

export const cancel = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const models = req.tc!.models.billing;
  const tenantId = req.tc!.tenant.tenantId;
  const note = await cancelDebitNote(models, tenantId, req.params.debitNoteId);
  await writeAudit({
    tenantId,
    actorId: req.authUser!.id,
    actorEmail: req.authUser!.email,
    action: AuditAction.CreditNoteCancelled,
    resource: 'debit_note',
    resourceId: note.debitNoteId,
    ip: req.ip,
    userAgent: req.get('user-agent'),
  });
  res.json({ success: true, data: { debitNote: serializeDebitNote(note) } });
});

export const list = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const notes = await listDebitNotes(req.tc!.models.billing, req.tc!.tenant.tenantId);
  res.json({ success: true, data: { items: notes.map((n) => serializeDebitNote(n)) } });
});