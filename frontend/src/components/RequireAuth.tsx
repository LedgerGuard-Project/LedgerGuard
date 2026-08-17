import type { FC, ReactNode } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { canAct } from '../lib/roles';
import type { UserRole } from '@ledgerguard/shared';

interface GuardProps {
  children?: ReactNode;
  fallbackPath?: string;
  requiredRole?: UserRole;
}

/** Route layout: renders <Outlet/> only when an access token exists. */
export const RequireAuth: FC<GuardProps> = ({ fallbackPath = '/login' }) => {
  const accessToken = useAuthStore((s) => s.accessToken);
  const location = useLocation();
  if (!accessToken) {
    return (
      <Navigate
        to={fallbackPath}
        state={{ from: `${location.pathname}${location.search}` }}
        replace
      />
    );
  }
  return <Outlet />;
};

/** Element guard: renders children only when the user's role satisfies `requiredRole`. */
export const RequireRole: FC<GuardProps> = ({ children, requiredRole, fallbackPath = '/dashboard' }) => {
  const accessToken = useAuthStore((s) => s.accessToken);
  const role = useAuthStore((s) => s.user?.role);
  const location = useLocation();
  if (!accessToken || !role) {
    return <Navigate to="/login" state={{ from: `${location.pathname}${location.search}` }} replace />;
  }
  if (requiredRole && !canAct(role, requiredRole)) {
    return <Navigate to={fallbackPath} replace />;
  }
  return <>{children}</>;
};