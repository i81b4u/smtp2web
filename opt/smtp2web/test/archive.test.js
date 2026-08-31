const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const childProcess = require('child_process');

const configDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'smtp2web-archive-config-'));
const configPath = path.join(configDirectory, 'config.json');
fs.writeFileSync(configPath, JSON.stringify({ archive: { enabled: false, path: '/unused', timezone: 'UTC' } }));
process.env.SMTP2WEB_CONFIG = configPath;
const { archiveDayForTimestamp, archiveTimestampForPayload } = require('../archive');

test.after(() => fs.rmSync(configDirectory, { recursive: true, force: true }));

test('archive day uses Europe/Amsterdam local calendar across midnight and DST', () => {
  assert.equal(archiveDayForTimestamp('2026-08-31T21:59:59.000Z', 'Europe/Amsterdam'), '2026-08-31');
  assert.equal(archiveDayForTimestamp('2026-08-31T22:00:00.000Z', 'Europe/Amsterdam'), '2026-09-01');
  // Winter is UTC+1 and summer is UTC+2; both are resolved from the IANA zone.
  assert.equal(archiveDayForTimestamp('2026-01-15T23:30:00.000Z', 'Europe/Amsterdam'), '2026-01-16');
  assert.equal(archiveDayForTimestamp('2026-07-15T22:30:00.000Z', 'Europe/Amsterdam'), '2026-07-16');
  // The spring DST transition changes the offset but remains deterministic.
  assert.equal(archiveDayForTimestamp('2026-03-29T22:30:00.000Z', 'Europe/Amsterdam'), '2026-03-30');
});

test('archive day defaults to the existing UTC behavior when configured as UTC', () => {
  assert.equal(archiveDayForTimestamp('2026-08-31T22:30:00.000Z', 'UTC'), '2026-08-31');
});

test('missing archive timezone preserves UTC archive bucketing', () => {
  assert.equal(archiveDayForTimestamp('2026-08-31T22:30:00.000Z'), '2026-08-31');
});

test('archive bucketing uses the acceptance timestamp instead of processing time', () => {
  const receivedAt = '2026-08-31T21:59:59.000Z';
  const processingAt = '2026-08-31T22:30:00.000Z';
  const timestamp = archiveTimestampForPayload({ meta: { receivedAt } }, processingAt);

  assert.equal(timestamp, receivedAt);
  assert.equal(archiveDayForTimestamp(timestamp, 'Europe/Amsterdam'), '2026-08-31');
});

test('invalid archive timezone is rejected during configuration loading', () => {
  const invalidConfig = path.join(configDirectory, 'invalid-config.json');
  fs.writeFileSync(invalidConfig, JSON.stringify({
    archive: { enabled: false, path: '/unused', timezone: 'Europe/Not-A-Timezone' }
  }));

  assert.throws(() => childProcess.execFileSync(
    process.execPath,
    ['-e', "require('./config')"],
    {
      cwd: path.join(__dirname, '..'),
      env: { ...process.env, SMTP2WEB_CONFIG: invalidConfig },
      stdio: 'pipe'
    }
  ));
});
