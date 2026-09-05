import { randomBytes } from 'crypto';
const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

function randomToken(length: number): string {
  const bytes = randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i++) {
    out += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return out;
}

/** Stable human-readable per-tenant business key, e.g. CUS-h7d2k9. */
export function newId(prefix: string): string {
  return `${prefix}-${randomToken(8)}`;
}

export const newCustomerId = () => newId('CUS');
export const newAccountId = () => newId('ACC');
export const newTransactionId = () => newId('TXN');
export const newInvoiceId = () => newId('INV');
export const newEntryId = () => newId('ENT');
export const newReference = () => `REF-${randomToken(10).toUpperCase()}`;
export const newReconciliationId = () => newId('REC');
export const newBankTransactionId = () => newId('BNK');
export const newBankBatchId = () => newId('BATCH');
export const newRecurringPlanId = () => newId('RPL');
export const newTaxRateId = () => newId('TXR');
export const newCreditNoteId = () => newId('CRN');
export const newDebitNoteId = () => newId('DBN');
export const newApprovalId = () => newId('APR');
export const newPeriodId = () => newId('PRD');
export const newExceptionId = () => newId('EXC');
export const newWebhookEndpointId = () => newId('WHE');
export const newWebhookDeliveryId = () => newId('WHD');
export const newApiKeyId = () => newId('KEY');
export const newBillingRuleId = () => newId('RUL');
export const newCommunicationId = () => newId('COM');
export const newSavedViewId = () => newId('VEW');
export const newEvidenceId = () => newId('EVD');

/** Idempotent webhook event ID, e.g. evt_9f2a7b3c1d5e. */
export function newWebhookEventId(): string {
  return `evt_${randomToken(12)}`;
}

/** High-entropy webhook signing secret. */
export function newWebhookSecret(): string {
  return `whsec_${randomBytes(24).toString('hex')}`;
}

/** Cryptographically random idempotency key, e.g. payment_ab12cd34ef. */
export function newIdempotencyKey(): string {
  return `payment_${randomToken(12)}`;
}

/** Random lock owner token so a lock can only be released by its holder. */
export function newLockToken(): string {
  return randomBytes(24).toString('hex');
}
