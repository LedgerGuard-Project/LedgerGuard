import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchMe, login as loginApi, logout as logoutApi, register as registerApi } from '../services/auth.service';
import { useAuthStore } from '../store/authStore';
import type { AuthSession, MeResult } from '../types';
import { apiErrorMessage } from '../lib/api';

export function useMe(enabled: boolean) {
  const setSession = useAuthStore((s) => s.setSession);
  const clearSession = useAuthStore((s) => s.clearSession);
  const result = useQuery<MeResult, Error>({
    queryKey: ['me'],
    // Persist the latest /auth/me payload into the store as soon as it arrives.
    queryFn: async () => {
      const me = await fetchMe();
      setSession(me);
      return me;
    },
    enabled,
    retry: false,
    staleTime: 60_000,
  });
  // TanStack Query v5 removed query-level onSuccess/onError callbacks;
  // sync the store from the query result instead.
  useEffect(() => {
    if (result.isError) clearSession();
  }, [result.isError, clearSession]);
  return result;
}

export function useBootstrapAuth() {
  const accessToken = useAuthStore((s) => s.accessToken);
  return useMe(!!accessToken);
}

export function useRegister() {
  const setSession = useAuthStore((s) => s.setSession);
  const navigate = useNavigate();
  return useMutation({
    mutationFn: registerApi,
    onSuccess: (session: AuthSession) => {
      setSession(session);
      navigate('/dashboard');
    },
    onError: (err: unknown) => {
      throw new Error(apiErrorMessage(err, 'Registration failed'));
    },
  });
}

export function useLogin() {
  const setSession = useAuthStore((s) => s.setSession);
  return useMutation({
    mutationFn: loginApi,
    onSuccess: (session: AuthSession) => {
      setSession(session);
    },
  });
}

export function useLogout() {
  const clearSession = useAuthStore((s) => s.clearSession);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  return useMutation({
    mutationFn: logoutApi,
    onSuccess: () => {
      clearSession();
      queryClient.removeQueries({ queryKey: ['me'] });
      queryClient.removeQueries({ queryKey: ['dashboard'] });
      navigate('/login');
    },
  });
}