const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const config = require('./config');

function archiveDayForTimestamp(timestamp, timezone = 'UTC') {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date(timestamp));
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function archiveTimestampForPayload(payload, fallbackTimestamp) {
  const receivedAt = payload?.meta?.receivedAt;
  return typeof receivedAt === 'string' && !Number.isNaN(Date.parse(receivedAt))
    ? receivedAt
    : fallbackTimestamp;
}

async function archivePayload(payload) {
  // When enabled, archiving stores successfully forwarded messages by day so
  // retention/compression scripts can work on whole date directories.
  if (!config.archive?.enabled) return;

  const ts = new Date().toISOString();
  // receivedAt is assigned at SMTP acceptance and survives queue retries. Old
  // queue files may lack it, so retain the historical processing-time fallback.
  const archiveTimestamp = archiveTimestampForPayload(payload, ts);
  const day = archiveDayForTimestamp(archiveTimestamp, config.archive.timezone ?? 'UTC');
  const dir = path.join(config.archive.path, day);

  await fs.mkdir(dir, { recursive: true });

  const id = payload?.meta?.messageId || 'unknown';
  // Include timestamp and queue id to keep archive filenames unique and stable.
  const file = path.join(
    dir,
    `${ts.replace(/[:.]/g, '-')}_${id}.json`
  );
  // Keep incomplete writes invisible to the compression timer. A rename within
  // one directory is atomic, so the timer sees either no file or a complete
  // JSON payload (it only processes files ending in .json).
  const temporaryFile = path.join(
    dir,
    `.${path.basename(file)}.${process.pid}.${crypto.randomUUID()}.tmp`
  );

  try {
    await fs.writeFile(temporaryFile, JSON.stringify(payload, null, 2));
    await fs.rename(temporaryFile, file);
  } catch (err) {
    await fs.unlink(temporaryFile).catch(() => {});
    throw err;
  }
}

module.exports = { archivePayload, archiveDayForTimestamp, archiveTimestampForPayload };
