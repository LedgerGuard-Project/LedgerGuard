import type { Response } from 'express';
import { AuditAction, SOCKET_EVENTS } from '@ledgerguard/shared';
import type { AuthenticatedRequest } from '../../types';
import { asyncHandler } from '../../utils/asyncHandler';
import {
  createCreditNote,
  issueCreditNote,
  cancelCreditNote,
  listCreditNotes,
} from '../../services/billing/creditNote.service';
import { serializeCreditNote } from '../../services/billing/serializers';
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
  const note = await createCreditNote(models, tenantId, req.body);
  await writeAudit({
    tenantId,
    actorId: req.authUser!.id,
    actorEmail: req.authUser!.email,
    action: AuditAction.CreditNoteCreated,
    resource: 'credit_note',
    resourceId: note.creditNoteId,
    details: { creditNoteNumber: note.creditNoteNumber, totalMinor: note.totalMinor },
    ip: req.ip,
    userAgent: req.get('user-agent'),
  });
  emitTenantEvent(tenantId, SOCKET_EVENTS.creditNoteCreated, { creditNoteId: note.creditNoteId, status: note.status });
  res.status(201).json({ success: true, data: { creditNote: serializeCreditNote(note) } });
});

export const issue = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const key = idempotencyKeyFrom(req);
  const result = await issueCreditNote(
    req.tc!.connection,
    req.tc!.models.billing,
    req.tc!.tenant.tenantId,
    { id: req.authUser!.id, email: req.authUser!.email },
    req.params.creditNoteId,
    { idempotencyKey: key },
    { ip: req.ip, userAgent: req.get('user-agent') },
  );
  res.json({ success: true, data: result });
});

export const cancel = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const models = req.tc!.models.billing;
  const tenantId = req.tc!.tenant.tenantId;
  const note = await cancelCreditNote(models, tenantId, req.params.creditNoteId);
  await writeAudit({
    tenantId,
    actorId: req.authUser!.id,
    actorEmail: req.authUser!.email,
    action: AuditAction.CreditNoteCancelled,
    resource: 'credit_note',
    resourceId: note.creditNoteId,
    ip: req.ip,
    userAgent: req.get('user-agent'),
  });
  res.json({ success: true, data: { creditNote: serializeCreditNote(note) } });
});

export const list = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const notes = await listCreditNotes(req.tc!.models.billing, req.tc!.tenant.tenantId);
  res.json({ success: true, data: { items: notes.map((n) => serializeCreditNote(n)) } });
});