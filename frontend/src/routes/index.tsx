import {
  createBrowserRouter,
  type RouteObject,
} from 'react-router-dom';
import LandingPage from '../pages/LandingPage';
import LoginPage from '../pages/LoginPage';
import RegisterPage from '../pages/RegisterPage';
import DashboardPage from '../pages/DashboardPage';
import ProfilePage from '../pages/ProfilePage';
import SettingsPage from '../pages/SettingsPage';
import UsersPage from '../pages/UsersPage';
import OrganizationsPage from '../pages/OrganizationsPage';
import NotFoundPage from '../pages/NotFoundPage';
import ErrorPage from '../pages/ErrorPage';
import { AppLayout } from '../layouts/AppLayout';
import { AuthLayout } from '../layouts/AuthLayout';
import { RequireAuth, RequireRole } from '../components/RequireAuth';
import { UserRole } from '@ledgerguard/shared';

export const routes: RouteObject[] = [
  { path: '/', element: <LandingPage /> },
  { path: '/login', element: <AuthLayout />, children: [{ index: true, element: <LoginPage /> }] },
  { path: '/register', element: <AuthLayout />, children: [{ index: true, element: <RegisterPage /> }] },
  {
    element: <RequireAuth />,
    children: [
      {
        element: <AppLayout />,
        children: [
          { path: '/dashboard', element: <DashboardPage /> },
          { path: '/profile', element: <ProfilePage /> },
          { path: '/settings', element: <SettingsPage /> },
          {
            path: '/team',
            element: <RequireRole requiredRole={UserRole.CompanyAdmin}><UsersPage /></RequireRole>,
          },
          {
            path: '/organizations',
            element: (
              <RequireRole requiredRole={UserRole.SuperAdmin}><OrganizationsPage /></RequireRole>
            ),
          },
        ],
      },
    ],
  },
  { path: '*', element: <NotFoundPage /> },
];

export const router = createBrowserRouter([
  {
    errorElement: <ErrorPage />,
    children: routes,
  },
]);
