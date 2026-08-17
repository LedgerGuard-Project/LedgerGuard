import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  listUsers,
  createUser,
  updateUser,
  deleteUser,
  changeUserRole,
  changeUserStatus,
} from '../services/users.service';
import type { ListUsersResponse, CreateUserPayload, UpdateUserPayload } from '../services/users.service';
import { apiErrorMessage } from '../lib/api';

export function useUsers() {
  return useQuery({
    queryKey: ['users'],
    queryFn: listUsers,
    staleTime: 30_000,
  });
}

export function useCreateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateUserPayload) => createUser(payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
    onError: (err: unknown) => {
      throw new Error(apiErrorMessage(err, 'Failed to create user'));
    },
  });
}

export function useUpdateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...payload }: { id: string } & UpdateUserPayload) =>
      updateUser(id, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
    onError: (err: unknown) => {
      throw new Error(apiErrorMessage(err, 'Failed to update user'));
    },
  });
}

export function useDeleteUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteUser,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
    onError: (err: unknown) => {
      throw new Error(apiErrorMessage(err, 'Failed to delete user'));
    },
  });
}

export { changeUserRole, changeUserStatus, type ListUsersResponse };