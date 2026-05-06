const fs = require('fs/promises');
const path = require('path');
const config = require('./config');
const logger = require('./logger');
const { validateJSON } = require('./validator-core');

const SPOOL = config.queue.path;
const QUARANTINE = path.join(SPOOL, 'quarantine');

let validating = false;
let validateTimer;

async function ensureQuarantineDir() {
  await fs.mkdir(QUARANTINE, { recursive: true });
}

async function validateFile(file) {
  const full = path.join(SPOOL, file);

  try {
    const data = JSON.parse(await fs.readFile(full, 'utf8'));

    if (!validateJSON(data)) {
      throw new Error('JSON validation failed');
    }
  } catch (err) {
    await ensureQuarantineDir();
    await fs.rename(full, path.join(QUARANTINE, file));
    logger.error('validator', 'quarantine', 'invalid file moved to quarantine', {
      file,
      error: err.message
    });
  }
}

async function runValidator() {
  if (validating) return;
  validating = true;

  try {
    await ensureQuarantineDir();
    const files = await fs.readdir(SPOOL);

    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      await validateFile(file);
    }
  } catch (err) {
    logger.error('validator', 'run', 'validator run failed', {
      error: err.message
    });
  } finally {
    validating = false;
  }
}

function startValidator() {
  if (validateTimer) return validateTimer;

  validateTimer = setInterval(
    runValidator,
    config.queue.validateIntervalSeconds * 1000
  );

  return validateTimer;
}

if (require.main === module) {
  startValidator();
}

module.exports = { runValidator, startValidator };
