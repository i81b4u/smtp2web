const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const config = require('./config');

async function archivePayload(payload) {
  // When enabled, archiving stores successfully forwarded messages by day so
  // retention/compression scripts can work on whole date directories.
  if (!config.archive?.enabled) return;

  const ts = new Date().toISOString();
  const day = ts.slice(0, 10); // YYYY-MM-DD
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

module.exports = { archivePayload };
