const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const { saveRawMessageIfEnabled } = require('../debug');
const { parseMail } = require('../mail');

test('raw SMTP debugging is disabled by default configuration', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'smtp2web-debug-'));
  try {
    const result = await saveRawMessageIfEnabled({
      saveRawMessages: false,
      rawMessagePath: directory
    }, Buffer.from('Subject: not saved\r\n\r\nbody\r\n'));

    assert.equal(result, null);
    assert.deepEqual(await fs.readdir(directory), []);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test('raw SMTP debugging preserves bytes, uses the configured path, and parsing still works', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'smtp2web-debug-'));
  const directory = path.join(root, 'configured-debug-path');
  // Deliberately omit From: so this does not get confused with SMTP envelope
  // information or get invented by parsing/debug persistence.
  const raw = Buffer.from('To: receiver@example.test\r\nSubject: raw bytes\r\n\r\nline 1\r\nline 2\r\n');
  try {
    const file = await saveRawMessageIfEnabled({
      saveRawMessages: true,
      rawMessagePath: directory
    }, raw);

    assert.equal(path.dirname(file), directory);
    assert.match(path.basename(file), /\.eml$/);
    assert.deepEqual(await fs.readFile(file), raw);
    assert.equal((await fs.stat(directory)).mode & 0o777, 0o700);
    assert.equal((await fs.stat(file)).mode & 0o777, 0o600);

    const payload = await parseMail(raw);
    assert.equal(payload.mail.subject, 'raw bytes');
    assert.equal(payload.mail.from, undefined);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
