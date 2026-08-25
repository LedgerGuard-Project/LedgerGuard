const { MongoClient } = require('mongodb');
async function main() {
  const c = new MongoClient('mongodb://127.0.0.1:27018/?directConnection=true');
  await c.connect();
  const db = c.db('lg_ledgerguard_platform');
  const entries = await db.collection('system.profile').find({ op: { $in: ['insert', 'remove', 'update'] } }).sort({ ts: 1 }).limit(80).toArray();
  for (const e of entries) {
    let detail = '';
    if (e.op === 'insert') detail = 'n=' + (e.ninserted === undefined ? '?' : e.ninserted);
    if (e.op === 'remove') { const q = e.command && e.command.q ? JSON.stringify(e.command.q) : JSON.stringify(e.query || {}); detail = 'removed=' + (e.nremoved === undefined ? '?' : e.nremoved) + ' q=' + q; }
    if (e.op === 'update') detail = 'nModified=' + (e.nModified === undefined ? '?' : e.nModified);
    console.log(e.ts.toISOString().slice(11, 23), e.op, e.ns, detail);
  }
  console.log('demo counts:', await db.collection('billingcustomers').countDocuments({ customerId: { $regex: '^demo_' } }), await db.collection('billinginvoices').countDocuments({ invoiceId: { $regex: '^demo_' } }), await db.collection('ledgertransactions').countDocuments({ transactionId: { $regex: '^demo_' } }));
  await db.command({ profile: 0 });
  console.log('profiling disabled');
  await c.close();
}
main().catch(e => { console.error(e.message); process.exit(1); });
