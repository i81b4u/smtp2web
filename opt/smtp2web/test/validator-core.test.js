const test = require('node:test');
const assert = require('node:assert/strict');
const { SCHEMA_VERSION, validatePayload } = require('../validator-core');

function validPayload(overrides = {}) {
  return {
    meta: {
      schemaVersion: SCHEMA_VERSION,
      messageId: 'f3e0d1c2-b4a5-4f67-8123-123456789abc',
      receivedAt: '2026-07-11T10:00:00.000Z'
    },
    mail: {
      text: 'Device report',
      attachments: []
    },
    session: {
      remoteAddress: '192.0.2.10',
      tls: true
    },
    ...overrides
  };
}

test('accepts structurally valid mail without optional headers', () => {
  const result = validatePayload(validPayload());

  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, []);
});

test('accepts a legacy queue item without a schema version', () => {
  const payload = validPayload();
  delete payload.meta.schemaVersion;

  const result = validatePayload(payload);

  assert.equal(result.valid, true);
});

test('rejects an unsupported schema version', () => {
  const payload = validPayload();
  payload.meta.schemaVersion = 2;

  const result = validatePayload(payload);

  assert.equal(result.valid, false);
  assert.ok(result.errors.includes('meta.schemaVersion must be 1'));
});

test('rejects a missing message identifier', () => {
  const payload = validPayload();
  delete payload.meta.messageId;

  const result = validatePayload(payload);

  assert.equal(result.valid, false);
  assert.ok(result.errors.includes('meta.messageId must be a UUID'));
});

test('rejects attachments whose content was not encoded for JSON', () => {
  const payload = validPayload({
    mail: { attachments: [{ content: Buffer.from('report') }] }
  });

  const result = validatePayload(payload);

  assert.equal(result.valid, false);
  assert.ok(result.errors.includes('mail.attachments[0].content must be a base64 string'));
});

test('rejects missing TLS session metadata', () => {
  const payload = validPayload({ session: { remoteAddress: '192.0.2.10' } });

  const result = validatePayload(payload);

  assert.equal(result.valid, false);
  assert.ok(result.errors.includes('session.tls must be a boolean'));
});
