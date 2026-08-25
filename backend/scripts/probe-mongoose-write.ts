/* Matrix test: which mongoose write paths actually persist? */
import { mongoose } from 'mongoose';
import { createBillingModels } from '../src/models/billing';

const URI = 'mongodb://127.0.0.1:27018/lg_ledgerguard_platform?directConnection=true';
const TAG = 'probe3_';

async function main(): Promise<void> {
  const connA = await mongoose.createConnection(URI).asPromise();
  const mA = createBillingModels(connA);
  const docsA = Array.from({ length: 12 }, (_, i) => ({
    customerId: `${TAG}a_${i}`,
    tenantId: 'ledgerguard-platform',
    name: `A${i}`,
    email: `${TAG}a${i}@probe.test`,
  }));
  await mA.Customer.insertMany(docsA, { ordered: false });
  console.log('A inserted:', docsA.length);

  await mA.Customer.collection.insertMany([
    { customerId: `${TAG}b_0`, tenantId: 'ledgerguard-platform', name: 'B0' },
    { customerId: `${TAG}b_1`, tenantId: 'ledgerguard-platform', name: 'B1' },
    { customerId: `${TAG}b_2`, tenantId: 'ledgerguard-platform', name: 'B2' },
  ], { ordered: false });
  console.log('B inserted: 3');

  console.log('A in-process:', await mA.Customer.countDocuments({ customerId: { $regex: `^${TAG}a_` } }));
  console.log('B in-process:', await mA.Customer.countDocuments({ customerId: { $regex: `^${TAG}b_` } }));

  await connA.close();
}

main()
  .then(() => process.exit(0))
  .catch((e: unknown) => {
    console.error('ERR:', (e as Error).message);
    process.exit(1);
  });
