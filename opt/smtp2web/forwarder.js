const axios = require('axios');
const convert = require('xml-js');
const config = require('./config');
const logger = require('./logger');
const { validatePayload } = require('./validator-core');

async function forward(payload) {
  // Validate again at the delivery boundary. The queue quarantines malformed
  // spool files earlier; this protects callers that invoke forward directly.
  const validation = validatePayload(payload);
  if (!validation.valid) {
    logger.error('forwarder', 'validate', 'invalid payload, not sent', {
      messageId: payload?.meta?.messageId,
      errors: validation.errors
    });
    throw new Error(`Invalid payload: ${validation.errors.join('; ')}`);
  }

  let body;
  let headers;

  if (config.forwarder.format === 'xml') {
    // JSON is the internal canonical format. XML is generated only at the
    // forwarding edge for receivers that require it.
    const xml = convert.json2xml(JSON.stringify(payload), { compact: true, spaces: 0 });
    body = `<?xml version="1.0" encoding="UTF-8"?>\n<smtp2webMessage>\n${xml}\n</smtp2webMessage>`;
    headers = { 'Content-Type': 'application/xml; charset=UTF-8' };
  } else {
    body = payload;
    headers = { 'Content-Type': 'application/json; charset=UTF-8' };
  }

  const idempotency = config.forwarder.idempotency;
  if (idempotency?.enabled) {
    const messageId = payload?.meta?.messageId;
    if (!messageId) {
      throw new Error('Cannot send idempotency header without meta.messageId');
    }

    // This is opt-in so receivers that do not understand idempotency remain
    // completely unaffected. Capable receivers can use the stable queue UUID
    // to acknowledge retries without processing the message more than once.
    headers[idempotency.header || 'Idempotency-Key'] = messageId;
  }

  // A failed POST throws and leaves the item in the durable queue for another
  // delivery attempt.
  const response = await axios.post(
    config.forwarder.endpoint,
    body,
    {
      headers,
      timeout: config.forwarder.timeoutSeconds * 1000
    }
  );

  logger.info('forwarder', 'send', 'payload forwarded', {
    messageId: payload?.meta?.messageId,
    format: config.forwarder.format,
    status: response.status,
    idempotencyEnabled: Boolean(idempotency?.enabled)
  });
}

module.exports = { forward };
