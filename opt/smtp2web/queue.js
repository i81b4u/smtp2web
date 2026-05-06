const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const config = require('./config');
const logger = require('./logger');
const { forward } = require('./forwarder');

const SPOOL = config.queue.path;
const QUARANTINE = path.join(SPOOL, 'quarantine');
const FAILED = config.queue.failedPath || path.join(SPOOL, 'failed');
const MAX_ATTEMPTS = config.queue.maxAttempts || 10;

let processing = false;
let retryTimer;

async function ensureQueueDirs() {
  await fs.mkdir(SPOOL, { recursive: true });
  await fs.mkdir(QUARANTINE, { recursive: true });
  await fs.mkdir(FAILED, { recursive: true });
}

async function writeQueueFileAtomic(file, payload) {
  const tmpFile = `${file}.${process.pid}.${Date.now()}.tmp`;

  await fs.writeFile(tmpFile, JSON.stringify(payload, null, 2));
  await fs.rename(tmpFile, file);
}

function markDeliveryFailure(payload, err) {
  payload.meta ??= {};
  payload.meta.delivery ??= {};
  payload.meta.delivery.attempts = (payload.meta.delivery.attempts || 0) + 1;
  payload.meta.delivery.lastAttemptAt = new Date().toISOString();
  payload.meta.delivery.lastError = err.message;

  return payload.meta.delivery.attempts;
}

async function processQueueOnce() {
  if (processing) return;
  processing = true;
  try {
    await processQueue();
  } catch (err) {
    logger.error('queue', 'process', 'queue processing failed', {
      error: err.message
    });
  } finally {
    processing = false;
  }
}

async function enqueue(payload) {
  const id = crypto.randomUUID();
  payload.meta ??= {};
  payload.meta.messageId = id;

  await ensureQueueDirs();

  const file = path.join(SPOOL, `${id}.json`);

  await writeQueueFileAtomic(file, payload);

  logger.info('queue', 'enqueue', 'message queued', { messageId: id });

  processQueueOnce(); // immediate attempt
}

async function processQueue() {
  await ensureQueueDirs();

  const files = await fs.readdir(SPOOL);

  for (const file of files) {
    if (!file.endsWith('.json')) continue;

    const full = path.join(SPOOL, file);
    let payload;

    try {
      payload = JSON.parse(await fs.readFile(full, 'utf8'));
    } catch (err) {
      await fs.mkdir(QUARANTINE, { recursive: true });
      await fs.rename(full, path.join(QUARANTINE, file));
      logger.error('queue', 'quarantine', 'invalid JSON moved to quarantine', {
        file,
        error: err.message
      });
      continue;
    }

    try {
      await forward(payload);
      await fs.unlink(full);
      logger.info('queue', 'cleanup', 'message removed from queue', {
        messageId: payload?.meta?.messageId
      });
    } catch (err) {
      const attempts = markDeliveryFailure(payload, err);

      if (attempts >= MAX_ATTEMPTS) {
        await writeQueueFileAtomic(full, payload);
        await fs.rename(full, path.join(FAILED, file));
        logger.error('queue', 'failed', 'delivery failed permanently', {
          file,
          messageId: payload?.meta?.messageId,
          attempts,
          error: err.message
        });
        continue;
      }

      await writeQueueFileAtomic(full, payload);
      logger.warn('queue', 'retry', 'delivery failed, will retry', {
        file,
        messageId: payload?.meta?.messageId,
        attempts,
        maxAttempts: MAX_ATTEMPTS,
        error: err.message
      });
    }
  }
}

function startQueueProcessor() {
  if (retryTimer) return retryTimer;

  retryTimer = setInterval(
    processQueueOnce,
    config.queue.retryIntervalSeconds * 1000
  );

  return retryTimer;
}

module.exports = { enqueue, processQueueOnce, startQueueProcessor };
