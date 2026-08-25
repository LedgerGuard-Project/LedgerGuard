import { connectGlobalDatabase, disconnectGlobalDatabase } from './connect';
import { cache } from './cache';
import { tenantConnectionManager } from './TenantConnectionManager';
import { TenantModel } from '../models/Tenant';
import { createBillingModels, type BillingModels } from '../models/billing';
import { logger } from '../utils/logger';

/**
 * DEVELOPMENT-ONLY demo data generator for Phase 3 analytics.
 * Creates realistic Customers / Invoices / LedgerTransactions over the
 * trailing ~120 days. All records are labeled `demo_*`; analytics still
 * compute every KPI from these raw records. Idempotent via demo_ marker.
 */

const DAYS = 120;
const rand = (min: number, max: number): number => Math.floor(Math.random() * (max - min + 1)) + min;
const pick = <T>(arr: T[]): T => arr[rand(0, arr.length - 1)];

const DEMO_CUSTOMERS = [
  'Acme Logistics', 'BlueRiver Traders', 'Crestline Foods', 'Delta Fabrics',
  'Evergreen Tools', 'FoxHollow Farms', 'Grandview Motors', 'Hilltop Pharma',
  'Ironclad Steel', 'Junction Softworks', 'Kestrel Aviation', 'Lumen Energy',
];

interface DemoTx {
  transactionId: string; tenantId: string; customerId: string; accountId: string;
  invoiceId?: string; amountMinor: number; currency: string; type: string; status: string;
  paymentMethod?: string; failureReason?: string; description?: string;
  createdAt: Date; completedAt?: Date;
}

async function seedDemoAnalytics(models: BillingModels): Promise<void> {
  // Fresh run: clear any previous attempt (makes reruns deterministic).
  await models.Customer.deleteMany({ customerId: { $regex: '^demo_' } });
  await models.Invoice.deleteMany({ invoiceId: { $regex: '^demo_' } });
  await models.LedgerTransaction.deleteMany({ transactionId: { $regex: '^demo_' } });


  const tenantId = 'ledgerguard-platform';
  const currency = 'INR';
  const now = Date.now();
  const activeCount = 10;

  const insertedCustomers = await models.Customer.insertMany(
    DEMO_CUSTOMERS.map((name, i) => ({
      customerId: `demo_cust_${i + 1}`,
      tenantId,
      name,
      email: `${name.toLowerCase().replace(/[^a-z]+/g, '.')}@demo.example`,
      status: i < activeCount ? ('active' as const) : ('archived' as const),
      createdAt: new Date(now - rand(30, DAYS) * 86_400_000),
    })),
    { ordered: false },
  );
  logger.info(`Inserted ${insertedCustomers.length} demo customers`);
  console.log('DEBUG recount via mongoose:', await models.Customer.countDocuments({ customerId: { $regex: '^demo_' } }));
  console.log('DEBUG recount via raw collection:', await models.Customer.collection.countDocuments({ customerId: { $regex: '^demo_' } }));
  return seedInvoices(models, tenantId, currency, now, activeCount);
}

async function seedInvoices(
  models: BillingModels,
  tenantId: string,
  currency: string,
  now: number,
  activeCount: number,
): Promise<void> {
  const invoices: Array<Record<string, unknown>> = [];
  const invoiceMeta: Array<{ invoiceId: string; customerId: string; totalMinor: number; created: Date; status: string }> = [];
  let invSeq = 0;
  for (let day = DAYS; day >= 0; day -= 3) {
    for (let k = 0, count = rand(1, 3); k < count; k++) {
      const custIdx = rand(1, activeCount);
      const subtotalMinor = rand(150_000, 900_000);
      const taxMinor = Math.round(subtotalMinor * 0.18);
      const discountMinor = Math.random() < 0.25 ? rand(5_000, 40_000) : 0;
      const totalMinor = subtotalMinor + taxMinor - discountMinor;
      const issueDate = new Date(now - day * 86_400_000);
      const dueDate = new Date(issueDate.getTime() + 15 * 86_400_000);
      const isOverdue = now > dueDate.getTime();
      const roll = Math.random();
      let status: string;
      if (!isOverdue) status = roll < 0.55 ? 'paid' : roll < 0.9 ? 'issued' : 'draft';
      else if (roll < 0.6) status = 'paid';
      else if (roll < 0.85) status = 'overdue';
      else if (roll < 0.95) status = 'partially_paid';
      else status = 'cancelled';
      if (status === 'draft') continue;

      invSeq += 1;
      const invoiceId = `demo_inv_${invSeq}`;
      invoiceMeta.push({ invoiceId, customerId: `demo_cust_${custIdx}`, totalMinor, created: issueDate, status });
      invoices.push({
        invoiceId,
        invoiceNumber: `DEMO-${String(invSeq).padStart(5, '0')}`,
        tenantId,
        customerId: `demo_cust_${custIdx}`,
        items: [{ description: 'Professional services', quantity: 1, unitPriceMinor: subtotalMinor, amountMinor: subtotalMinor }],
        subtotalMinor,
        taxMinor,
        discountMinor,
        totalMinor,
        currency,
        status,
        issueDate,
        dueDate,
        ...(status === 'paid' ? { paidAt: new Date(issueDate.getTime() + rand(1, 10) * 86_400_000) } : {}),
        createdAt: issueDate,
      });
    }
  }
  await models.Invoice.insertMany(invoices);
  logger.info(`Inserted ${invoices.length} demo invoices`);
  return seedTransactions(models, tenantId, currency, now, invoiceMeta, activeCount);
}

async function seedTransactions(
  models: BillingModels,
  tenantId: string,
  currency: string,
  now: number,
  invoiceMeta: Array<{ invoiceId: string; customerId: string; totalMinor: number; created: Date; status: string }>,
  activeCount: number,
): Promise<void> {
  // Fresh run: clear any partial previous attempt.
  await Promise.all([
    models.Customer.deleteMany({ customerId: { $regex: '^demo_' } }),
    models.Invoice.deleteMany({ invoiceId: { $regex: '^demo_' } }),
    models.LedgerTransaction.deleteMany({ transactionId: { $regex: '^demo_' } }),
  ]);

  const txs: DemoTx[] = [];
  let txSeq = 0;
  const methods = ['card', 'upi', 'netbanking', 'wallet'];

  for (const meta of invoiceMeta) {
    const statusRoll = Math.random();
    const status =
      meta.status === 'paid' || meta.status === 'partially_paid'
        ? 'completed'
        : meta.status === 'overdue'
          ? statusRoll < 0.5 ? 'failed' : 'pending'
          : statusRoll < 0.7 ? 'completed'
            : statusRoll < 0.85 ? 'failed' : 'processing';

    txSeq += 1;
    txs.push({
      transactionId: `demo_txn_${txSeq}`,
      tenantId,
      customerId: meta.customerId,
      accountId: 'demo_account_primary',
      invoiceId: meta.invoiceId,
      amountMinor: meta.totalMinor,
      currency,
      type: 'charge',
      status,
      idempotencyKey: `demo_idem_${txSeq}`,
      paymentMethod: pick(methods),
      failureReason:
        status === 'failed'
          ? pick(['insufficient_funds', 'card_declined', 'network_timeout', 'invalid_upi_handle'])
          : undefined,
      description: 'Demo charge',
      createdAt: meta.created,
      ...(status === 'completed' ? { completedAt: meta.created } : {}),
    });

    if (status === 'completed' && Math.random() < 0.08) {
      const refundAt = new Date(meta.created.getTime() + rand(2, 20) * 86_400_000);
      if (refundAt.getTime() < now) {
        txSeq += 1;
        txs.push({
          transactionId: `demo_txn_${txSeq}`,
          idempotencyKey: `demo_idem_${txSeq}`,
          tenantId,
          customerId: meta.customerId,
          accountId: 'demo_account_primary',
          invoiceId: meta.invoiceId,
          amountMinor: Math.round(meta.totalMinor * (Math.random() < 0.7 ? 0.5 : 1)),
          currency,
          type: 'refund',
          status: 'completed',
          description: 'Demo refund',
          createdAt: refundAt,
          completedAt: refundAt,
        });
      }
    }
  }

  for (let d = DAYS; d >= 0; d--) {
    if (Math.random() < 0.55) continue;
    const custIdx = rand(1, activeCount);
    const at = new Date(now - d * 86_400_000 - rand(0, 20) * 3_600_000);
    const spike = Math.random() < 0.04 ? rand(20, 45) : 0;
    txSeq += 1;
    const status = Math.random() < 0.92 ? 'completed' : 'failed';
    txs.push({
      transactionId: `demo_txn_${txSeq}`,
      idempotencyKey: `demo_idem_${txSeq}`,
      tenantId,
      customerId: `demo_cust_${custIdx}`,
      accountId: 'demo_account_primary',
      amountMinor: rand(80_000, 350_000) + spike * 100_000,
      currency,
      type: 'charge',
      status,
      paymentMethod: pick(methods),
      failureReason: status === 'failed' ? pick(['insufficient_funds', 'card_declined']) : undefined,
      description: 'Demo walk-in charge',
      createdAt: at,
    });
  }

  for (let i = 0; i < txs.length; i += 200) {
    await models.LedgerTransaction.insertMany(txs.slice(i, i + 200), { ordered: false });
  }
  logger.info(`Inserted ${txs.length} demo ledger transactions`);

  // ---- DEBUG: verify visibility inside this very process/connection ----
  console.log('DEBUG db name:', models.Customer.db.name, '| host:', models.Customer.db.host);
  console.log('DEBUG in-process customer count:', await models.Customer.countDocuments({ customerId: { $regex: '^demo_' } }));
  console.log('DEBUG in-process tx count:', await models.LedgerTransaction.countDocuments({ transactionId: { $regex: '^demo_' } }));
  try {
    await models.Customer.collection.insertOne({ customerId: 'demo_probe_raw', tenantId, name: 'Raw Probe', createdAt: new Date() });
    console.log('DEBUG raw insertOne ok; raw count:', await models.Customer.collection.countDocuments({ customerId: 'demo_probe_raw' }));
    const writeCheck = await models.Customer.collection.insertMany([{ customerId: 'demo_probe_raw2', tenantId, name: 'Raw Probe 2' }], { ordered: false });
    console.log('DEBUG raw insertMany result ids:', writeCheck.insertedIds);
  } catch (err) {
    console.log('DEBUG raw insert ERROR:', (err as Error).message);
  }
  console.log('DEBUG post-raw total demo customers:', await models.Customer.collection.countDocuments({ customerId: { $regex: '^demo_' } }));
}

export async function runDemoAnalyticsSeed(): Promise<void> {
  await connectGlobalDatabase();
  await cache.init();
  try {
    const tenant = await TenantModel.findOne({ tenantId: 'ledgerguard-platform' }).lean();
    if (!tenant) throw new Error('Default tenant not found â€” run `npm run seed` first.');
    const dbName = String((tenant as unknown as { databaseConnection?: string }).databaseConnection ?? 'lg_ledgerguard_platform');
    const connection = await tenantConnectionManager.connectTenant('ledgerguard-platform', dbName);
    await seedDemoAnalytics(createBillingModels(connection));
    logger.info('Phase 3 demo analytics seed completed');
  } finally {
    await tenantConnectionManager.shutdown();
    await disconnectGlobalDatabase();
  }
}

runDemoAnalyticsSeed()
  .then(() => process.exit(0))
  .catch((err: unknown) => {
    logger.error('Demo analytics seed failed', { err: (err as Error).message });
    void disconnectGlobalDatabase().finally(() => process.exit(1));
  });
