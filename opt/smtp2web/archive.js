const fs = require('fs/promises');
const path = require('path');
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

  await fs.writeFile(file, JSON.stringify(payload, null, 2));
}

module.exports = { archivePayload };
