import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  listTenants,
  provisionTenant,
  updateTenant,
  disconnectTenant,
} from '../services/tenants.service';
import type { Tenant } from '../types';
import { apiErrorMessage } from '../lib/api';

export function useTenants() {
  return useQuery({
    queryKey: ['tenants'],
    queryFn: listTenants,
    staleTime: 60_000,
    retry: false,
  });
}

export function useProvisionTenant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: provisionTenant,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tenants'] }),
    onError: (err: unknown) => {
      throw new Error(apiErrorMessage(err, 'Failed to provision tenant'));
    },
  });
}

export function useUpdateTenant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...payload }: { id: string; subscriptionPlan?: string; status?: string }) =>
      updateTenant(id, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tenants'] }),
    onError: (err: unknown) => {
      throw new Error(apiErrorMessage(err, 'Failed to update tenant'));
    },
  });
}

export function useDisconnectTenant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: disconnectTenant,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tenants'] }),
    onError: (err: unknown) => {
      throw new Error(apiErrorMessage(err, 'Failed to disconnect tenant'));
    },
  });
}

export type { Tenant };