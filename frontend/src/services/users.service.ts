import { apiClient } from '../lib/api';
import type { User, UserStatus } from '../types';

export interface ListUsersResponse {
  users: User[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

export interface CreateUserPayload {
  name: string;
  email: string;
  role: string;
  password?: string;
}

export interface UpdateUserPayload {
  name?: string;
  role?: string;
  status?: UserStatus;
}

export async function listUsers(): Promise<ListUsersResponse> {
  const { data } = await apiClient.get<{ success: boolean; data: { users: User[] } }>('/users');
  const users = data.data.users;
  const total = users.length;
  return {
    users,
    pagination: { page: 1, limit: total, total, totalPages: 1 },
  };
}

export async function createUser(payload: CreateUserPayload): Promise<User> {
  const { data } = await apiClient.post<{ success: boolean; data: { user: User } }>('/users', payload);
  return data.data.user;
}

export async function updateUser(userId: string, payload: UpdateUserPayload): Promise<User> {
  const { data } = await apiClient.patch<{ success: boolean; data: { user: User } }>(
    `/users/${userId}`,
    payload,
  );
  return data.data.user;
}

export async function deleteUser(userId: string): Promise<void> {
  await apiClient.delete(`/users/${userId}`);
}

export async function changeUserRole(userId: string, role: string): Promise<User> {
  return updateUser(userId, { role });
}

export async function changeUserStatus(userId: string, status: UserStatus): Promise<User> {
  return updateUser(userId, { status });
}