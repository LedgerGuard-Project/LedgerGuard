import { useState, type FormEvent } from 'react';
import { useCreatePayment } from '../../hooks/useBilling';
import { Modal } from '../Modal';
import { Spinner } from '../Spinner';
import { apiErrorMessage } from '../../lib/api';

export interface RecordPaymentFormProps {
  invoiceId: string;
  customerId: string;
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

/** Inline "Record payment" form for an invoice. */
export function RecordPaymentForm({
  invoiceId,
  customerId,
  open,
  onClose,
  onSuccess,
}: RecordPaymentFormProps) {
  const create = useCreatePayment();
  const [amount, setAmount] = useState('');
  const [currency] = useState('USD');
  const [errorMsg, setErrorMsg] = useState('');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    try {
      const res = await create.mutateAsync({
        amount: Number(amount) * 100,
        currency,
        customerId,
        invoiceId,
      });
      if (res.replay) {
        alert('Duplicate payment ignored (idempotent replay).');
      }
      onSuccess();
    } catch (err) {
      setErrorMsg(apiErrorMessage(err, 'Could not record payment'));
    }
  };

  return (
    <Modal open={open} title="Record payment" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        {errorMsg && <div className="text-sm text-red-600">{errorMsg}</div>}
        <div>
          <label className="label">Amount (major units)</label>
          <input
            type="number"
            min={0}
            step={0.01}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
            className="input"
          />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
          <button type="submit" disabled={create.isPending} className="btn-primary">
            {create.isPending ? <Spinner className="h-4 w-4" /> : 'Record'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
