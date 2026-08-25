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
