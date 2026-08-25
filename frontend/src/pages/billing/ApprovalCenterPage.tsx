import { useState } from 'react';
import { motion } from 'framer-motion';
import { Check, X, XCircle } from 'lucide-react';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { DataState } from '../../components/DataState';
import { Modal } from '../../components/Modal';
import { StatusBadge, CurrencyAmount } from '../../components/StatusBadge';
import { useApprovals, useApproveApproval, useRejectApproval, useCancelApproval } from '../../hooks/useBilling';
import { formatDate } from '../../utils/format';
import type { ApprovalRequest, ApprovalStatus } from '../../types/billing';

const APPROVAL_LABELS: Record<ApprovalStatus, string> = {
  pending: 'Pending',
  approved: 'Approved',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
};

export const ApprovalCenterPage = () => {
  useDocumentTitle('Approvals');
  const { approvals, error, isError, isFetching } = useApprovals();
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [rejectTarget, setRejectTarget] = useState<ApprovalRequest | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const approveMut = useApproveApproval();
  const rejectMut = useRejectApproval();
  const cancelMut = useCancelApproval();

  const handleApprove = async (a: ApprovalRequest) => {
    try { await approveMut.mutateAsync(a.approvalId); } catch {}
  };

  const openReject = (a: ApprovalRequest) => {
    setRejectTarget(a);
    setRejectReason('');
    setRejectModalOpen(true);
  };

  const handleReject = async () => {
    if (!rejectTarget) return;
    try {
      await rejectMut.mutateAsync({ id: rejectTarget.approvalId, reason: rejectReason });
      setRejectModalOpen(false);
    } catch {}
  };

  const handleCancel = async (a: ApprovalRequest) => {
    try { await cancelMut.mutateAsync(a.approvalId); } catch {}
  };

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-ink-900 dark:text-white">Approval Center</h1>
      </div>

      <DataState isLoading={isFetching} isError={isError} error={error} empty={approvals.length === 0} emptyMessage="No approval requests.">
        <div className="overflow-x-auto rounded-lg border border-ink-200 dark:border-ink-800">
          <table className="w-full text-sm">
            <thead><tr className="bg-ink-50 dark:bg-ink-900">
              <th className="px-4 py-2.5 text-left text-xs font-medium text-ink-600 dark:text-ink-300">Resource</th>
              <th className="px-4 py-2.5 text-left text-xs font-medium text-ink-600 dark:text-ink-300">Requester</th>
              <th className="px-4 py-2.5 text-right text-xs font-medium text-ink-600 dark:text-ink-300">Amount</th>
              <th className="px-4 py-2.5 text-left text-xs font-medium text-ink-600 dark:text-ink-300">Created</th>
              <th className="px-4 py-2.5 text-left text-xs font-medium text-ink-600 dark:text-ink-300">Status</th>
              <th className="px-4 py-2.5 text-center text-xs font-medium text-ink-600 dark:text-ink-300">Actions</th>
            </tr></thead>
            <tbody>
              {approvals.map((a) => (
                <tr key={a.approvalId} className="border-t border-ink-200 dark:border-ink-800 last:border-0">
                  <td className="px-4 py-2.5 align-top">
                    <div className="font-medium text-ink-900 dark:text-white capitalize">{a.resourceType}</div>
                    <div className="text-xs text-ink-500">{a.resourceName ?? a.resourceId}</div>
                  </td>
                  <td className="px-4 py-2.5 align-top">{a.requesterEmail}</td>
                  <td className="px-4 py-2.5 text-right align-top"><CurrencyAmount minor={a.amountMinor} currency={a.currency} /></td>
                  <td className="px-4 py-2.5 align-top">{formatDate(a.createdAt)}</td>
                  <td className="px-4 py-2.5 align-top"><StatusBadge status={a.status} /></td>
                  <td className="px-4 py-2.5 text-center align-top space-x-1">
                    {a.status === 'pending' && (
                      <>
                        <button onClick={() => handleApprove(a)} className="inline-block rounded p-1 text-green-600 hover:bg-green-50" title="Approve"><Check size={14} /></button>
                        <button onClick={() => openReject(a)} className="inline-block rounded p-1 text-red-600 hover:bg-red-50" title="Reject"><X size={14} /></button>
                        <button onClick={() => handleCancel(a)} className="inline-block rounded p-1 text-ink-500 hover:bg-ink-100" title="Cancel"><XCircle size={14} /></button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </DataState>

      {rejectModalOpen && rejectTarget && (
        <Modal open={rejectModalOpen} title={`Reject ${APPROVAL_LABELS.pending.toLowerCase()} request`}
          onClose={() => setRejectModalOpen(false)}
          footer={<div className="flex justify-end gap-2"><button onClick={() => setRejectModalOpen(false)} className="btn btn-ghost">Cancel</button><button onClick={handleReject} className="btn btn-primary">Reject</button></div>}>
          <div><label className="block text-xs font-medium text-ink-600 dark:text-ink-300">Reason (optional)</label>
            <textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)}
              className="mt-1 block w-full rounded-md border border-ink-300 bg-white px-3 py-1.5 text-sm focus:ring-2 focus:ring-brand-500 dark:border-ink-700 dark:bg-ink-900 dark:text-ink-100" rows={3}
              placeholder="Enter rejection reason…" />
          </div>
        </Modal>
      )}
    </motion.div>
  );
};

export default ApprovalCenterPage;
