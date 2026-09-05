import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateApiKey, hashApiKey, verifyApiKey, looksLikeApiKey } from '../src/utils/apiKeyCrypto';
import { API_KEY_PREFIX } from '@ledgerguard/shared';
import { effectiveRoleFor } from '../src/services/apiKey.service';

test('API key: generated key has the prefix and a strong body', () => {
  const { rawKey, displayPrefix, keyHash } = generateApiKey();
  assert.ok(rawKey.startsWith(API_KEY_PREFIX));
  assert.ok(rawKey.length > API_KEY_PREFIX.length + 40);
  assert.ok(displayPrefix.startsWith(API_KEY_PREFIX));
  // The hash is a sha256 hex digest (64 chars).
  assert.match(keyHash, /^[0-9a-f]{64}$/);
});

test('API key: stored hash verifies the raw key but rejects tampering', () => {
  const { rawKey, keyHash } = generateApiKey();
  assert.equal(verifyApiKey(rawKey, keyHash), true);
  assert.equal(verifyApiKey(rawKey + 'x', keyHash), false);
  assert.equal(verifyApiKey('different-key', keyHash), false);
});

test('API key: hash is deterministic and never stores the raw key', () => {
  const { rawKey, keyHash } = generateApiKey();
  assert.equal(hashApiKey(rawKey), keyHash);
  assert.ok(!keyHash.includes(rawKey));
});

test('API key: looksLikeApiKey only matches the prefix signature', () => {
  assert.equal(looksLikeApiKey(`${API_KEY_PREFIX}abc`), true);
  assert.equal(looksLikeApiKey('eyJhbGciOi...'), false);
});

test('API key: least-privilege role mapping', () => {
  assert.equal(effectiveRoleFor(['READ']), 'viewer');
  assert.equal(effectiveRoleFor(['READ', 'PAYMENTS']), 'finance_manager');
  assert.equal(effectiveRoleFor(['READ', 'ADMIN']), 'company_admin');
});