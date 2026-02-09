const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const config = require('/etc/smtp2web/config.json');
const logger = require('/opt/smtp2web/logger');
const { forward } = require('/opt/smtp2web/forwarder');

const SPOOL = config.queue.path;
const QUARANTINE = path.join(SPOOL, 'quarantine');

let processing = false;

async function processQueueOnce() {
  if (processing) return;
  processing = true;
  try {
    await processQueue();
  } finally {
    processing = false;
  }
}

async function enqueue(payload) {
  const id = crypto.randomUUID();
  payload.meta.messageId = id;

  const file = path.join(SPOOL, `${id}.json`);
  await fs.writeFile(file, JSON.stringify(payload, null, 2));

  logger.info('queue', 'enqueue', 'message queued', { messageId: id });

  processQueueOnce(); // immediate attempt
}

async function processQueue() {
  const files = await fs.readdir(SPOOL);

  for (const file of files) {
    if (!file.endsWith('.json')) continue;

    const full = path.join(SPOOL, file);
    let payload;

    try {
      payload = JSON.parse(await fs.readFile(full, 'utf8'));
    } catch (err) {
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
      logger.warn('queue', 'retry', 'delivery failed, will retry', {
        file,
        error: err.message
      });
    }
  }
}

setInterval(
  processQueue,
  config.queue.retryIntervalSeconds * 1000
);

module.exports = { enqueue };
