const fs = require('fs/promises');
const path = require('path');
const config = require('/etc/smtp2web/config.json');
const logger = require('/opt/smtp2web/logger');
const { validateJSON } = require('/opt/smtp2web/validator-core');

const SPOOL = config.queue.path;
const QUARANTINE = path.join(SPOOL, 'quarantine');

async function validateFile(file) {
  const full = path.join(SPOOL, file);

  try {
    const data = JSON.parse(await fs.readFile(full, 'utf8'));

    if (!validateJSON(data)) {
      throw new Error('JSON validation failed');
    }
  } catch (err) {
    await fs.rename(full, path.join(QUARANTINE, file));
    logger.error('validator', 'quarantine', 'invalid file moved to quarantine', {
      file,
      error: err.message
    });
  }
}

async function runValidator() {
  const files = await fs.readdir(SPOOL);

  for (const file of files) {
    if (!file.endsWith('.json')) continue;
    await validateFile(file);
  }
}

setInterval(
  runValidator,
  config.queue.validateIntervalSeconds * 1000
);
