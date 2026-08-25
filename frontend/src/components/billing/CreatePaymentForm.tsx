import { useState, type FormEvent } from 'react';
import { useCreatePayment, useCustomers } from '../../hooks/useBilling';
import { Modal } from '../Modal';
import { Spinner } from '../Spinner';
import { apiErrorMessage } from '../../lib/api';
import { PAYMENT_METHODS } from '../../types/billing';

export interface CreatePaymentFormProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function CreatePaymentForm({ open, onClose, onSuccess }: CreatePaymentFormProps) {
  const { data: customers } = useCustomers({});
  const create = useCreatePayment();
  const [customerId, setCustomerId] = useState('');
  const [amount, setAmount] = useState('');
  const [currency] = useState('USD');
  const [invoiceId, setInvoiceId] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('card');
  const [errorMsg, setErrorMsg] = useState('');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    if (!customerId) { setErrorMsg('Select a customer.'); return; }
    try {
      await create.mutateAsync({
        amount: Number(amount) * 100,
        currency,
        customerId,
        invoiceId: invoiceId || undefined,
        paymentMethod,
      });
      onSuccess();
    } catch (err) {
      setErrorMsg(apiErrorMessage(err, 'Could not create payment'));
    }
  };

  return (
    <Modal open={open} title="Record payment" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        {errorMsg && <div className="text-sm text-red-600">{errorMsg}</div>}
        <div>
          <label className="label">Customer</label>
          <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} required className="input">
            <option value="">Select a customer</option>
            {customers?.items.map((c) => (
              <option key={c.customerId} value={c.customerId}>{c.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Amount (major units)</label>
          <input type="number" min={0} step={0.01} value={amount} onChange={(e) => setAmount(e.target.value)} required className="input" />
        </div>
        <div>
          <label className="label">Invoice (optional)</label>
          <input value={invoiceId} onChange={(e) => setInvoiceId(e.target.value)} placeholder="Invoice id" className="input" />
        </div>
        <div>
          <label className="label">Method</label>
          <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} className="input">
            {PAYMENT_METHODS.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
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
