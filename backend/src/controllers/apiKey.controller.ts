import type { Response } from 'express';
import { AuditAction, API_KEY_PERMISSIONS, type ApiKeyPermission } from '@ledgerguard/shared';
import type { AuthenticatedRequest } from '../types';
import { asyncHandler } from '../utils/asyncHandler';
import {
  createApiKey,
  listApiKeys,
  revokeApiKey,
  rotateApiKey,
} from '../services/apiKey.service';
import { writeAudit } from '../services/audit.service';

function auditContext(req: AuthenticatedRequest) {
  return {
    tenantId: req.tc!.tenant.tenantId,
    actorId: req.authUser!.id,
    actorEmail: req.authUser!.email,
    ip: req.ip,
    userAgent: req.get('user-agent'),
  };
}

export const listKeys = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const items = await listApiKeys(req.tc!.tenant.tenantId);
  res.json({ success: true, data: { items } });
});

export const createKey = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const permissions = (req.body.permissions as string[]).filter((p): p is ApiKeyPermission =>
    (API_KEY_PERMISSIONS as readonly string[]).includes(p),
  );
  const expiresAt = req.body.expiresAt ? new Date(String(req.body.expiresAt)) : null;
  const { apiKey, rawKey } = await createApiKey(req.tc!.tenant.tenantId, {
    name: String(req.body.name ?? ''),
    permissions,
    expiresAt: expiresAt && !Number.isNaN(expiresAt.getTime()) ? expiresAt : null,
    actor: { id: req.authUser!.id, email: req.authUser!.email },
  });
  await writeAudit({
    ...auditContext(req),
    action: AuditAction.ApiKeyCreated,
    resource: 'api_key',
    resourceId: apiKey.keyId,
    details: { name: apiKey.name, permissions },
  });
  res.status(201).json({ success: true, data: { apiKey, rawKey } });
});

export const revokeKey = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const key = await revokeApiKey(req.tc!.tenant.tenantId, req.params.keyId, {
    id: req.authUser!.id,
    email: req.authUser!.email,
  });
  await writeAudit({
    ...auditContext(req),
    action: AuditAction.ApiKeyRevoked,
    resource: 'api_key',
    resourceId: key.keyId,
    details: { name: key.name },
  });
  res.json({ success: true, data: { apiKey: key } });
});

export const rotateKey = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { apiKey, rawKey } = await rotateApiKey(req.tc!.tenant.tenantId, req.params.keyId, {
    id: req.authUser!.id,
    email: req.authUser!.email,
  });
  await writeAudit({
    ...auditContext(req),
    action: AuditAction.ApiKeyRotated,
    resource: 'api_key',
    resourceId: req.params.keyId,
    details: { newKeyId: apiKey.keyId },
  });
  res.json({ success: true, data: { apiKey, rawKey } });
});