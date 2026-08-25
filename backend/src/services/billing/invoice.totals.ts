import type { InvoiceDocument } from '../../models/billing/Invoice';
import { ApiError } from '../../utils/ApiError';
import { sumMinor } from '../../utils/money';

export interface InvoiceLineInput {
  description: string;
  quantity: number;
  unitPrice: number; // major units decimal
  taxRate?: number; // percent 0-100
}

interface ComputedTotals {
  items: InvoiceDocument['items'];
  subtotalMinor: number;
  taxMinor: number;
  discountMinor: number;
  totalMinor: number;
}

function roundGeneric(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Build line items + totals from major-unit inputs using integer-cents math so
 * subtotal/tax/total always reconcile exactly.
 */
export function computeInvoiceTotals(
  inputLines: InvoiceLineInput[],
  discountMajor = 0,
): ComputedTotals {
  if (!inputLines.length) {
    throw ApiError.badRequest('Invoice must contain at least one line item', 'INVOICE_NO_ITEMS');
  }
  const items = inputLines.map((line) => {
    const unitPriceMinor = Math.round(roundGeneric(line.unitPrice) * 100);
    const qty = roundGeneric(line.quantity);
    if (unitPriceMinor < 0 || qty < 0) {
      throw ApiError.badRequest('Invoice line amounts must be non-negative', 'INVOICE_BAD_LINE');
    }
    const amountMinor = Math.round(unitPriceMinor * qty);
    const taxRate = line.taxRate ?? 0;
    const taxMinor = Math.round(amountMinor * (taxRate / 100));
    return {
      description: line.description,
      quantity: qty,
      unitPriceMinor,
      amountMinor,
      taxRate,
      lineTaxMinor: taxMinor,
    };
  });
  const subtotalMinor = sumMinor(items.map((i) => i.amountMinor));
  const taxMinor = sumMinor(items.map((i) => (i as unknown as { lineTaxMinor: number }).lineTaxMinor));
  const discountMinor = Math.round(roundGeneric(discountMajor) * 100);
  const totalMinor = Math.max(0, subtotalMinor + taxMinor - discountMinor);

  return {
    items: items.map(({ lineTaxMinor: _lineTax, ...rest }) => rest) as InvoiceDocument['items'],
    subtotalMinor,
    taxMinor,
    discountMinor,
    totalMinor,
  };
}