import {
  createBrowserRouter,
  type RouteObject,
} from 'react-router-dom';
import { lazy, Suspense, type ReactNode } from 'react';
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
import { Spinner } from '../components/Spinner';
import BillingPage from '../pages/billing/BillingPage';
import CustomersPage from '../pages/billing/CustomersPage';
import InvoicesPage from '../pages/billing/InvoicesPage';
import NotificationsPage from '../pages/billing/NotificationsPage';
import InvoiceDetailPage from '../pages/billing/InvoiceDetailPage';
import PaymentsPage from '../pages/billing/PaymentsPage';
import LedgerPage from '../pages/billing/LedgerPage';
import TransactionDetailPage from '../pages/billing/TransactionDetailPage';
import ReconcilePage from '../pages/billing/ReconcilePage';
import RecurringPage from '../pages/billing/RecurringPage';
import TaxSettingsPage from '../pages/billing/TaxSettingsPage';
import CreditNotesPage from '../pages/billing/CreditNotesPage';
import DebitNotesPage from '../pages/billing/DebitNotesPage';
import ApprovalCenterPage from '../pages/billing/ApprovalCenterPage';
import FinancialPeriodsPage from '../pages/billing/FinancialPeriodsPage';
import ReportsPage from '../pages/billing/ReportsPage';
import ExceptionsPage from '../pages/billing/ExceptionsPage';
import OperationsPage from '../pages/OperationsPage';
import CloseDashboardPage from '../pages/CloseDashboardPage';
import DeveloperPortalPage from '../pages/developer/DeveloperPortalPage';
import ApiKeysPage from '../pages/developer/ApiKeysPage';
import WebhooksPage from '../pages/developer/WebhooksPage';

// Analytics section: lazy-loaded so chart-heavy pages ship as their own chunk
// (keeps the main bundle small; see Part 10/48 of PHASE_4_AUDIT.md).
const AnalyticsOverviewPage = lazy(() => import('../pages/analytics/AnalyticsOverviewPage'));
const RevenuePage = lazy(() => import('../pages/analytics/RevenuePage'));
const CashFlowPage = lazy(() => import('../pages/analytics/CashFlowPage'));
const ReceivablesPage = lazy(() => import('../pages/analytics/ReceivablesPage'));
const CustomerAnalyticsPage = lazy(() => import('../pages/analytics/CustomerAnalyticsPage'));
const PaymentAnalyticsPage = lazy(() => import('../pages/analytics/PaymentAnalyticsPage'));
const ForecastPage = lazy(() => import('../pages/analytics/ForecastPage'));
const AnomaliesPage = lazy(() => import('../pages/analytics/AnomaliesPage'));
// Phase 4 observability page (SuperAdmin only; backend enforces the same role).
const SystemHealthPage = lazy(() => import('../pages/system/SystemHealthPage'));

/** Suspense boundary for lazy analytics routes. */
function Suspend({ children }: { children: ReactNode }) {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[200px] items-center justify-center" role="status" aria-label="Loading page">
          <Spinner className="h-7 w-7" />
        </div>
      }
    >
      {children}
    </Suspense>
  );
}

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
                    { path: '/billing', element: <BillingPage /> },
          { path: '/billing/customers', element: <CustomersPage /> },
          { path: '/billing/invoices', element: <InvoicesPage /> },
          { path: '/billing/invoices/:invoiceId', element: <InvoiceDetailPage /> },
          { path: '/billing/payments', element: <PaymentsPage /> },
          { path: '/billing/notifications', element: <NotificationsPage /> },
          { path: '/billing/ledger', element: <LedgerPage /> },
          { path: '/billing/reconciliation', element: <RequireRole requiredRole={UserRole.FinanceManager}><ReconcilePage /></RequireRole> },
          { path: '/billing/transactions/:transactionId', element: <TransactionDetailPage /> },
          { path: '/billing/recurring', element: <RecurringPage /> },
          { path: '/billing/tax-rates', element: <TaxSettingsPage /> },
          { path: '/billing/credit-notes', element: <CreditNotesPage /> },
          { path: '/billing/debit-notes', element: <DebitNotesPage /> },
          { path: '/billing/approvals', element: <ApprovalCenterPage /> },
          { path: '/billing/financial-periods', element: <FinancialPeriodsPage /> },
          { path: '/billing/reports', element: <ReportsPage /> },
          // ---- Enterprise extension ----
          { path: '/reconciliation/exceptions', element: <RequireRole requiredRole={UserRole.FinanceManager}><ExceptionsPage /></RequireRole> },
          { path: '/operations', element: <OperationsPage /> },
          { path: '/close', element: <RequireRole requiredRole={UserRole.CompanyAdmin}><CloseDashboardPage /></RequireRole> },
          {
            path: '/developer',
            children: [
              { index: true, element: <DeveloperPortalPage /> },
              { path: 'api-keys', element: <RequireRole requiredRole={UserRole.CompanyAdmin}><ApiKeysPage /></RequireRole> },
              { path: 'webhooks', element: <RequireRole requiredRole={UserRole.FinanceManager}><WebhooksPage /></RequireRole> },
            ],
          },
          // ---- Phase 3 analytics (lazy-loaded chunk) ----
          { path: '/analytics', element: <Suspend><AnalyticsOverviewPage /></Suspend> },
          { path: '/analytics/revenue', element: <Suspend><RevenuePage /></Suspend> },
          { path: '/analytics/payments', element: <Suspend><PaymentAnalyticsPage /></Suspend> },
          { path: '/analytics/customers', element: <Suspend><CustomerAnalyticsPage /></Suspend> },
          { path: '/analytics/receivables', element: <Suspend><ReceivablesPage /></Suspend> },
          { path: '/analytics/cashflow', element: <Suspend><CashFlowPage /></Suspend> },
          { path: '/analytics/forecast', element: <Suspend><ForecastPage /></Suspend> },
          // List is readable by every role; mutating actions are hidden client-side
          // AND enforced server-side via requireRole(FinanceManager).
          { path: '/analytics/anomalies', element: <Suspend><AnomaliesPage /></Suspend> },
          // ---- Phase 4 observability: super-admin system health (Part 17) ----
          {
            path: '/system/health',
            element: (
              <RequireRole requiredRole={UserRole.SuperAdmin}>
                <Suspend><SystemHealthPage /></Suspend>
              </RequireRole>
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
