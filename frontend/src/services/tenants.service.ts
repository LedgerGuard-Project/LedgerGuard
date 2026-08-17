import { apiClient } from '../lib/api';
import type { Tenant } from '../types';

export interface ListTenantsResponse {
  tenants: Tenant[];
}

export interface UpdateTenantPayload {
  subscriptionPlan?: string;
  status?: string;
}

export interface ProvisionTenantPayload {
  tenantId: string;
  companyName: string;
  ownerName: string;
  ownerEmail: string;
  ownerPassword: string;
  subscriptionPlan?: string;
}

export async function listTenants(): Promise<Tenant[]> {
  const { data } = await apiClient.get<{ success: boolean; data: { tenants: Tenant[] } }>('/tenants');
  return data.data.tenants;
}

export async function getTenant(id: string): Promise<Tenant> {
  const { data } = await apiClient.get<{ success: boolean; data: { tenant: Tenant } }>(
    `/tenants/${id}`,
  );
  return data.data.tenant;
}

export async function provisionTenant(payload: ProvisionTenantPayload): Promise<Tenant> {
  const { data } = await apiClient.post<{ success: boolean; data: { tenant: Tenant } }>(
    '/tenants',
    payload,
  );
  return data.data.tenant;
}

export async function updateTenant(id: string, payload: UpdateTenantPayload): Promise<Tenant> {
  const { data } = await apiClient.patch<{ success: boolean; data: { tenant: Tenant } }>(
    `/tenants/${id}`,
    payload,
  );
  return data.data.tenant;
}

export async function disconnectTenant(id: string): Promise<{ disconnected: boolean }> {
  const { data } = await apiClient.post<{ success: boolean; data: { disconnected: boolean } }>(
    `/tenants/${id}/disconnect`,
  );
  return data.data;
}