const fs = require('fs/promises');
const path = require('path');
const config = require('/etc/smtp2web/config.json');

async function archivePayload(payload) {
  if (!config.archive?.enabled) return;

  const ts = new Date().toISOString();
  const day = ts.slice(0, 10); // YYYY-MM-DD
  const dir = path.join(config.archive.path, day);

  await fs.mkdir(dir, { recursive: true });

  const id = payload?.meta?.messageId || 'unknown';
  const file = path.join(
    dir,
    `${ts.replace(/[:.]/g, '-')}_${id}.json`
  );

  await fs.writeFile(file, JSON.stringify(payload, null, 2));
}

module.exports = { archivePayload };
