import { useState } from 'react';
import { motion } from 'framer-motion';
import { Plus, Search, Trash2 } from 'lucide-react';
import { useUsers, useCreateUser, useDeleteUser } from '../hooks/useUsers';
import { useAuthStore } from '../store/authStore';
import { roleLabel, isCompanyAdmin } from '../lib/roles';
import { FormInput, FormSelect } from '../components/FormControls';
import { Spinner } from '../components/Spinner';
import { Badge } from '../components/DataState';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { UserRole, type User } from '@ledgerguard/shared';

export const UsersPage = () => {
  useDocumentTitle('Team');
  const user = useAuthStore((s) => s.user);
  const canManage = isCompanyAdmin(user);
  const { data, error, isError, isFetching, refetch } = useUsers();
  const create = useCreateUser();
  const remove = useDeleteUser();

  const users = data?.users ?? [];

  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState({ name: '', email: '', role: 'viewer', password: '' });

  const filtered = search
    ? users.filter(
        (u) =>
          u.name?.toLowerCase().includes(search.toLowerCase()) ||
          u.email?.toLowerCase().includes(search.toLowerCase()),
      )
    : users;

  const resetForm = () => setForm({ name: '', email: '', role: 'viewer', password: '' });

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManage) return;
    create.mutate(
      form as { name: string; email: string; role: string; password: string },
      {
        onSuccess: () => {
          resetForm();
          setShowForm(false);
          refetch();
        },
      },
    );
  };

  const handleDelete = (u: User) => {
    if (!canManage) return;
    if (window.confirm(`Remove ${u.name} (${u.email}) from the organization?`)) {
      remove.mutate(u.id, { onSuccess: () => refetch() });
    }
  };

    return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-ink-900 dark:text-white">Team</h1>
        {canManage && (
          <button onClick={() => setShowForm((v) => !v)} className="btn btn-primary">
            <Plus size={16} /> {showForm ? 'Cancel' : 'Add member'}
          </button>
        )}
      </div>

      {showForm && canManage && (
        <motion.form layout onSubmit={handleCreate} className="grid gap-4 rounded-xl border border-ink-200 p-4 dark:border-ink-800 sm:grid-cols-3">
          <FormInput placeholder="Full name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          <FormInput type="email" placeholder="email@company.com" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
          <FormSelect value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
            <option value="viewer">Viewer</option>
            <option value="finance_manager">Finance Manager</option>
            <option value="company_admin">Company Admin</option>
          </FormSelect>
          <FormInput type="password" placeholder="Password (min 8 chars)" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} minLength={8} />
          <button type="submit" disabled={!form.name || !form.email || form.password.length < 8 || create.isPending} className="btn btn-ghost sm:col-span-3 justify-self-start">
            {create.isPending ? <Spinner className="h-4 w-4" /> : 'Save member'}
          </button>
          {create.isError && (
            <p className="sm:col-span-3 text-sm text-red-600">
              {(create.error as { message?: string } | undefined)?.message ?? 'Failed to create user'}
            </p>
          )}
        </motion.form>
      )}

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
        <input className="input pl-9" placeholder="Search team members..." value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {isFetching ? (
        <div className="py-8 text-center text-ink-500">
          <Spinner />
          <span className="ml-2">Loading team…</span>
        </div>
      ) : isError ? (
        <div className="py-8 text-center text-sm text-red-600">{(error as Error)?.message ?? 'Failed to load users'}</div>
      ) : filtered.length === 0 ? (
        <div className="py-12 text-center text-sm text-ink-500">{search ? 'No matching users.' : 'No team members yet.'}</div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-ink-200 dark:border-ink-800">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-ink-50 dark:bg-ink-900">
                <th className="px-4 py-2.5 text-left text-xs font-medium text-ink-600 dark:text-ink-300">Name</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-ink-600 dark:text-ink-300">Role</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-ink-600 dark:text-ink-300">Status</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-ink-600 dark:text-ink-300">Last login</th>
                <th className="px-4 py-2.5 text-right text-xs font-medium text-ink-600 dark:text-ink-300">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((u: User) => (
                <tr key={u.id} className="border-b border-ink-200 dark:border-ink-800 last:border-0">
                  <td className="px-4 py-2.5 align-top">
                    <div>
                      <p className="font-medium text-ink-900 dark:text-white">{u.name}</p>
                      <p className="text-xs text-ink-500">{u.email}</p>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 align-top">
                    <Badge variant={u.role === UserRole.SuperAdmin ? 'error' : u.role === UserRole.CompanyAdmin ? 'info' : u.role === UserRole.FinanceManager ? 'warning' : 'default'}>
                      {roleLabel(u.role)}
                    </Badge>
                  </td>
                  <td className="px-4 py-2.5 align-top">
                    <Badge variant={u.status === 'active' ? 'success' : u.status === 'disabled' ? 'error' : 'warning'}>{u.status}</Badge>
                  </td>
                  <td className="px-4 py-2.5 align-top text-ink-500">
                    {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleDateString() : 'Never'}
                  </td>
                  <td className="px-4 py-2.5 text-right align-top">
                    {canManage && (
                      <button onClick={() => handleDelete(u)} className="rounded p-1 text-ink-400 hover:bg-red-50 hover:text-red-700" title="Remove user">
                        <Trash2 size={16} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </motion.div>
      );
};

export default UsersPage;