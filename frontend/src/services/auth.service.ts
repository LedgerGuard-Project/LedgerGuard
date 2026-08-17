import { apiClient, apiErrorMessage } from '../lib/api';
import type { AuthSession, MeResult } from '../types';

export interface RegisterPayload {
  companyName: string;
  tenantId?: string;
  name: string;
  email: string;
  password: string;
  subscriptionPlan?: string;
}

export interface LoginPayload {
  tenantId: string;
  email: string;
  password: string;
}

export async function register(payload: RegisterPayload): Promise<AuthSession> {
  const { data } = await apiClient.post<{ success: boolean; data: AuthSession }>('/auth/register', payload);
  return data.data;
}

export async function login(payload: LoginPayload): Promise<AuthSession> {
  const { data } = await apiClient.post<{ success: boolean; data: AuthSession }>('/auth/login', payload);
  return data.data;
}

export async function refresh(): Promise<AuthSession> {
  const { data } = await apiClient.post<{ success: boolean; data: AuthSession }>('/auth/refresh', {});
  return data.data;
}

export async function logout(): Promise<void> {
  await apiClient.post('/auth/logout', {});
}

export async function fetchMe(): Promise<MeResult> {
  const { data } = await apiClient.get<{ success: boolean; data: MeResult }>('/auth/me');
  return data.data;
}

export { apiErrorMessage };