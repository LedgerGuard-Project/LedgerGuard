import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../lib/queryKeys';
import * as enterprise from '../services/enterprise.service';
import type { ApiKeyPermission, WebhookEventType } from '../types/billing';

// ---- Exceptions ----
export function useExceptions(params?: Record<string, unknown>) {
  return useQuery({
    queryKey: queryKeys.exceptions.list(params),
    queryFn: () => enterprise.listExceptions(params),
    placeholderData: (prev) => prev,
  });
}

export function useCreateException() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: enterprise.createException,
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.exceptions.base }),
  });
}

export function useAssignException() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (exceptionId: string) => enterprise.assignException(exceptionId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.exceptions.base });
      qc.invalidateQueries({ queryKey: queryKeys.operationsQueue });
    },
  });
}

export function useInvestigateException() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (exceptionId: string) => enterprise.investigateException(exceptionId),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.exceptions.base }),
  });
}

export function useResolveException() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ exceptionId, resolution, ignore }: { exceptionId: string; resolution: string; ignore?: boolean }) =>
      enterprise.resolveException(exceptionId, resolution, ignore),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.exceptions.base });
      qc.invalidateQueries({ queryKey: queryKeys.operationsQueue });
      qc.invalidateQueries({ queryKey: queryKeys.closeDashboard });
    },
  });
}

export function useReopenException() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ exceptionId, reason }: { exceptionId: string; reason: string }) =>
      enterprise.reopenException(exceptionId, reason),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.exceptions.base }),
  });
}

// ---- Operations / close ----
export function useOperationsQueue() {
  return useQuery({
    queryKey: queryKeys.operationsQueue,
    queryFn: enterprise.operationsQueue,
    refetchInterval: 60_000,
  });
}

export function useCloseDashboard(params?: { start?: string; end?: string }) {
  return useQuery({
    queryKey: [...queryKeys.closeDashboard, params ?? {}],
    queryFn: () => enterprise.closeDashboard(params),
  });
}

// ---- API keys ----
export function useApiKeys() {
  return useQuery({ queryKey: queryKeys.apiKeys, queryFn: enterprise.listApiKeys });
}

export function useCreateApiKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string; permissions: ApiKeyPermission[]; expiresAt?: string }) =>
      enterprise.createApiKey(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.apiKeys }),
  });
}

export function useRevokeApiKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (keyId: string) => enterprise.revokeApiKey(keyId),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.apiKeys }),
  });
}

export function useRotateApiKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (keyId: string) => enterprise.rotateApiKey(keyId),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.apiKeys }),
  });
}

// ---- Webhooks ----
export function useWebhooks() {
  return useQuery({ queryKey: queryKeys.webhooks.base, queryFn: enterprise.listWebhooks });
}

export function useCreateWebhook() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { url: string; description?: string; events: WebhookEventType[] }) =>
      enterprise.createWebhook(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.webhooks.base }),
  });
}

export function useUpdateWebhook() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ endpointId, patch }: { endpointId: string; patch: { url?: string; description?: string; events?: WebhookEventType[]; active?: boolean } }) =>
      enterprise.updateWebhook(endpointId, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.webhooks.base }),
  });
}

export function useRotateWebhookSecret() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (endpointId: string) => enterprise.rotateWebhookSecret(endpointId),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.webhooks.base }),
  });
}

export function useTestWebhook() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (endpointId: string) => enterprise.testWebhook(endpointId),
    onSuccess: (_data, endpointId) => {
      qc.invalidateQueries({ queryKey: queryKeys.webhooks.base });
      qc.invalidateQueries({ queryKey: queryKeys.webhooks.deliveries(endpointId) });
    },
  });
}

export function useWebhookDeliveries(endpointId?: string) {
  return useQuery({
    queryKey: queryKeys.webhooks.deliveries(endpointId),
    queryFn: () => enterprise.listDeliveries(endpointId!),
    enabled: Boolean(endpointId),
  });
}

export function useRetryDelivery() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (deliveryId: string) => enterprise.retryDelivery(deliveryId),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.webhooks.base }),
  });
}