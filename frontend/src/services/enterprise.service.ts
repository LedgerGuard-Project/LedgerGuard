import { apiClient } from '../lib/api';
import type {
  ApiKey,
  ApiKeyCreated,
  ApiKeyPermission,
  PaymentException,
  SlaStatus,
  WebhookDelivery,
  WebhookEndpoint,
  WebhookEventType,
} from '../types/billing';

/** Exception as returned by the API (adds the computed SLA evaluation). */
export type ExceptionWithSla = PaymentException & {
  sla: {
    status: SlaStatus;
    elapsedMs: number;
    remainingMs: number;
    consumedRatio: number;
    dueAt: string | null;
  };
};

export interface OperationsItem {
  id: string;
  type: 'pending_approval' | 'failed_payment' | 'overdue_invoice' | 'exception' | 'failed_webhook';
  title: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  status: string;
  owner: string | null;
  amountMinor: number | null;
  currency: string | null;
  createdAt: string;
  sla: { status: SlaStatus; elapsedMs: number; remainingMs: number; dueAt: string | null };
  link: string;
}

export interface OperationsResponse {
  items: OperationsItem[];
  summary: Array<{ type: OperationsItem['type']; count: number; breached: number }>;
}

export interface CloseCheck {
  id: string;
  label: string;
  passed: boolean;
  critical: boolean;
  count: number;
  detail: string;
}

export interface CloseDashboard {
  currency: string | null;
  invoicesIssued: { count: number; totalMinor: number };
  paymentsCollected: { count: number; totalMinor: number };
  creditNotesIssued: { count: number; totalMinor: number };
  debitNotesIssued: { count: number; totalMinor: number };
  netCashFlowMinor: number;
  outstandingAR: { count: number; totalMinor: number };
  unreconciledPayments: number;
  ledgerAdjustments: number;
  pendingApprovals: number;
  anomalies: number;
  checks: CloseCheck[];
  readinessScore: number | null;
  readyToClose: boolean;
}

export interface CreateExceptionInput {
  type: string;
  severity?: string;
  paymentId?: string;
  invoiceId?: string;
  customerId?: string;
  bankTransactionId?: string;
  amountMinor: number;
  currency: string;
  reason: string;
  slaHours?: number;
}

// ---- Exceptions ----
export async function listExceptions(params?: Record<string, unknown>): Promise<{ items: ExceptionWithSla[]; total: number; page: number; perPage: number }> {
  const { data } = await apiClient.get('/billing/exceptions', { params });
  return data.data;
}

export async function createException(input: CreateExceptionInput): Promise<ExceptionWithSla> {
  const { data } = await apiClient.post('/billing/exceptions', input);
  return data.data.exception;
}

export async function assignException(exceptionId: string): Promise<ExceptionWithSla> {
  const { data } = await apiClient.post(`/billing/exceptions/${exceptionId}/assign`, {});
  return data.data.exception;
}

export async function investigateException(exceptionId: string): Promise<ExceptionWithSla> {
  const { data } = await apiClient.post(`/billing/exceptions/${exceptionId}/investigate`);
  return data.data.exception;
}

export async function resolveException(exceptionId: string, resolution: string, ignore = false): Promise<ExceptionWithSla> {
  const { data } = await apiClient.post(`/billing/exceptions/${exceptionId}/resolve`, { resolution, ignore });
  return data.data.exception;
}

export async function reopenException(exceptionId: string, reason: string): Promise<ExceptionWithSla> {
  const { data } = await apiClient.post(`/billing/exceptions/${exceptionId}/reopen`, { reason });
  return data.data.exception;
}

// ---- Operations ----
export async function operationsQueue(): Promise<OperationsResponse> {
  const { data } = await apiClient.get('/operations/queue');
  return data.data;
}

export async function closeDashboard(params?: { start?: string; end?: string }): Promise<CloseDashboard> {
  const { data } = await apiClient.get('/operations/close', { params });
  return data.data;
}

// ---- API keys ----
export async function listApiKeys(): Promise<ApiKey[]> {
  const { data } = await apiClient.get('/developer/api-keys');
  return data.data.items;
}

export async function createApiKey(input: { name: string; permissions: ApiKeyPermission[]; expiresAt?: string }): Promise<ApiKeyCreated> {
  const { data } = await apiClient.post('/developer/api-keys', input);
  return data.data;
}

export async function revokeApiKey(keyId: string): Promise<ApiKey> {
  const { data } = await apiClient.post(`/developer/api-keys/${keyId}/revoke`, {});
  return data.data.apiKey;
}

export async function rotateApiKey(keyId: string): Promise<ApiKeyCreated> {
  const { data } = await apiClient.post(`/developer/api-keys/${keyId}/rotate`, {});
  return data.data;
}

// ---- Webhooks ----
export async function listWebhooks(): Promise<{ items: WebhookEndpoint[]; availableEvents: WebhookEventType[] }> {
  const { data } = await apiClient.get('/developer/webhooks');
  return data.data;
}

export async function createWebhook(input: { url: string; description?: string; events: WebhookEventType[] }): Promise<{ endpoint: WebhookEndpoint; secret: string }> {
  const { data } = await apiClient.post('/developer/webhooks', input);
  return data.data;
}

export async function updateWebhook(endpointId: string, patch: { url?: string; description?: string; events?: WebhookEventType[]; active?: boolean }): Promise<WebhookEndpoint> {
  const { data } = await apiClient.patch(`/developer/webhooks/${endpointId}`, patch);
  return data.data.endpoint;
}

export async function rotateWebhookSecret(endpointId: string): Promise<string> {
  const { data } = await apiClient.post(`/developer/webhooks/${endpointId}/rotate-secret`, {});
  return data.data.secret;
}

export async function testWebhook(endpointId: string): Promise<WebhookDelivery> {
  const { data } = await apiClient.post(`/developer/webhooks/${endpointId}/test`, {});
  return data.data.delivery;
}

export async function listDeliveries(endpointId: string): Promise<WebhookDelivery[]> {
  const { data } = await apiClient.get(`/developer/webhooks/${endpointId}/deliveries`);
  return data.data.items;
}

export async function retryDelivery(deliveryId: string): Promise<WebhookDelivery> {
  const { data } = await apiClient.post(`/developer/webhooks/deliveries/${deliveryId}/retry`, {});
  return data.data.delivery;
}