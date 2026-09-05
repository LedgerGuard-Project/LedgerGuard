import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  signWebhookPayload,
  verifyWebhookSignature,
  WEBHOOK_SIGNATURE_HEADER,
} from '../src/utils/webhookSignature';
import { assertValidWebhookUrl, assertValidEvents } from '../src/services/billing/webhook.service';

test('webhook: signature verifies for a valid payload', () => {
  const secret = 'whsec_test_secret';
  const body = JSON.stringify({ eventId: 'evt_1', data: { x: 1 } });
  const header = signWebhookPayload(secret, body);
  assert.ok(header.startsWith('t='));
  assert.ok(header.includes(',v1='));
  assert.equal(verifyWebhookSignature(secret, body, header, Math.floor(Date.now() / 1000)), true);
});

test('webhook: tampered payload is rejected', () => {
  const secret = 'whsec_test_secret';
  const body = JSON.stringify({ eventId: 'evt_1', data: { x: 1 } });
  const header = signWebhookPayload(secret, body);
  assert.equal(
    verifyWebhookSignature(secret, JSON.stringify({ eventId: 'evt_2', data: { x: 2 } }), header),
    false,
  );
});

test('webhook: mismatched secret is rejected', () => {
  const body = 'payload-body';
  const header = signWebhookPayload('secret-a', body);
  assert.equal(verifyWebhookSignature('secret-b', body, header), false);
});

test('webhook: stale timestamp is rejected', () => {
  const secret = 'whsec_test_secret';
  const body = 'payload-body';
  const now = Math.floor(Date.now() / 1000);
  const header = signWebhookPayload(secret, body, now - 3600); // 1 hour old
  assert.equal(verifyWebhookSignature(secret, body, header, now), false);
});

test('webhook: malformed header is rejected', () => {
  assert.equal(verifyWebhookSignature('s', 'body', 'not-a-header'), false);
  assert.equal(verifyWebhookSignature('s', 'body', ''), false);
});

test('webhook: header name is stable', () => {
  assert.equal(WEBHOOK_SIGNATURE_HEADER, 'x-ledgerguard-signature');
});

test('webhook: URL validation allows https and localhost http, rejects others', () => {
  assertValidWebhookUrl('https://example.com/hook');
  assertValidWebhookUrl('http://localhost:9000/hook');
  assert.throws(() => assertValidWebhookUrl('ftp://example.com/hook'));
  assert.throws(() => assertValidWebhookUrl('http://insecure.example.com/hook'));
  assert.throws(() => assertValidWebhookUrl('not-a-url'));
});

test('webhook: event validation rejects unknown events', () => {
  assertValidEvents(['invoice.created', 'payment.completed']);
  assert.throws(() => assertValidEvents([]));
  assert.throws(() => assertValidEvents(['invoice.created', 'nonsense.event']));
});