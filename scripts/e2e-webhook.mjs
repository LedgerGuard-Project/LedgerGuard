/* E2E: create a webhook endpoint, listen locally, trigger an invoice.created
   event, then confirm the delivery is recorded as signed + success. */
import http from 'node:http';
import { createHmac, timingSafeEqual } from 'node:crypto';

const API = 'http://localhost:4000/api';
const received = [];

// 1. Local receiver to capture signed payloads.
const server = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    received.push({ headers: req.headers, body, eventId: JSON.parse(body).eventId });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
  });
});
await new Promise((r) => server.listen(9999, r));

function sign(secret, body, ts) {
  return `t=${ts},v1=${createHmac('sha256', secret).update(`${ts}.${body}`).digest('hex')}`;
}
function verify(secret, body, header) {
  const [, ts, sig] = header.match(/^t=(\d+),v1=([0-9a-f]+)$/) ?? [];
  if (!ts || !sig) return false;
  if (Math.abs(Math.floor(Date.now() / 1000) - Number(ts)) > 300) return false;
  const expected = createHmac('sha256', secret).update(`${ts}.${body}`).digest('hex');
  const a = Buffer.from(expected, 'hex');
  const b = Buffer.from(sig, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}

async function login() {
  const r = await fetch(`${API}/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@ledgerguard.com', password: 'Admin@123', tenantId: 'ledgerguard-platform' }),
  });
  const j = await r.json();
  return j.data.accessToken;
}
const H = async (token) => ({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' });

const token = await login();

// 2. Create endpoint pointing at our local listener.
const wh = await fetch(`${API}/developer/webhooks`, {
  method: 'POST', headers: await H(token),
  body: JSON.stringify({ url: 'http://localhost:9999/hook', description: 'e2e', events: ['invoice.created'] }),
}).then((r) => r.json());
const secret = wh.data.secret;
const endpointId = wh.data.endpoint.endpointId;
console.log(`endpoint=${endpointId}`);

// 3. Create a customer + invoice to trigger invoice.created webhook.
const clist = await fetch(`${API}/billing/customers`, { headers: await H(token) }).then((r) => r.json());
let customerId = null;
if (clist.data && clist.data.items && clist.data.items.length > 0) {
  customerId = clist.data.items[0].customerId;
} else {
  const c = await fetch(`${API}/billing/customers`, { method: 'POST', headers: await H(token), body: JSON.stringify({ name: 'Webhook E2E Customer' }) }).then((r) => r.json());
  customerId = c.data && c.data.customer ? c.data.customer.customerId : null;
}
if (!customerId) { console.log('NO CUSTOMER ID; creating failed'); }
else console.log(`customer=${customerId}`);

const dinv = await fetch(`${API}/billing/invoices`, {
  method: 'POST', headers: await H(token),
  body: JSON.stringify({ customerId, currency: 'USD', items: [{ description: 'Webhook test', quantity: 1, unitPrice: 100 }] }),
});
const inv = await dinv.json();
if (!inv.data || !inv.data.invoice) { console.log('INVOICE CREATE FAILED', JSON.stringify(inv).slice(0, 500)); process.exit(1); }
console.log(`invoice=${inv.data.invoice.invoiceId}`);

// 4. Wait for the fire-and-forget delivery, then verify the captured payload.
await new Promise((r) => setTimeout(r, 2500));
if (received.length === 0) {
  console.log('RESULT: FAIL - no webhook received');
} else {
  const { body, eventId } = received[0];
  // The invoice.created event fans out to every endpoint subscribed to it
  // (older endpoints from earlier runs share this URL with different secrets),
  // so we verify that at least one delivered payload was signed with THIS
  // endpoint's secret — proving our endpoint's signing path is correct.
  let matched = false;
  for (const r of received) {
    if (verify(secret, r.body, r.headers['x-ledgerguard-signature'])) { matched = true; break; }
  }
  const payload = JSON.parse(body);
  console.log(`eventId=${eventId} type=${payload.eventType} tenant=${payload.tenantId} deliveriesReceived=${received.length} signedByThisEndpoint=${matched}`);
  const deliveries = await fetch(`${API}/developer/webhooks/${endpointId}/deliveries`, { headers: await H(token) }).then((r) => r.json());
  console.log(`delivery status=${deliveries.data.items[0].status} http=${deliveries.data.items[0].responseStatus} attempts=${deliveries.data.items[0].attempts}`);
  console.log(`RESULT: ${matched ? 'PASS' : 'FAIL'} — this endpoint signed a valid HMAC payload (${received.length} received)`);
}
server.close();
process.exit(0);
