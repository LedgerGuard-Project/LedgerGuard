/* Verify the new enterprise actions were persisted to the global audit log. */
import 'dotenv/config';
import mongoose from 'mongoose';

const uri = process.env.MONGO_URI ?? 'mongodb://localhost:27018/ledgerguard_global';
const conn = await mongoose.createConnection(uri).asPromise();
const AuditLog = conn.collection('auditlogs') ?? conn.collection('auditlog');

const want = ['exception_created', 'api_key_created', 'webhook_endpoint_created', 'exception_resolved'];
let hadAny = false;
for (const action of want) {
  const rows = await AuditLog.find({ action }).sort({ createdAt: -1 }).limit(1).toArray();
  if (rows.length > 0) {
    hadAny = true;
    const r = rows[0];
    console.log(`AUDIT OK: ${action} tenant=${r.tenantId} resource=${r.resource} resourceId=${r.resourceId}`);
  } else {
    console.log(`AUDIT MISSING: ${action}`);
  }
}
console.log('hadAny=' + hadAny);
await conn.close();
process.exit(0);
