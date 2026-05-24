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
  // Invalid queue files are preserved for inspection instead of deleted.
  await fs.mkdir(QUARANTINE, { recursive: true });
}

async function validateFile(file) {
  const full = path.join(SPOOL, file);

  try {
    // This validator is intended as a spool health check for files that may
    // have been manually edited or copied in for replay.
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
  // Avoid overlapping validation runs when the previous scan takes longer than
  // the configured interval.
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

  // The validator can be run as a separate long-lived process if desired.
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
