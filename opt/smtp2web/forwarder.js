const axios = require('axios');
const convert = require('xml-js');
const config = require('./config');
const logger = require('./logger');
const { validateJSON } = require('./validator-core');
const { archivePayload } = require('./archive');

async function forward(payload) {
  // Validate before delivery so malformed spool files are retried/failed by the
  // queue instead of being sent to the downstream HTTP endpoint.
  if (!validateJSON(payload)) {
    logger.error('forwarder', 'validate', 'invalid payload, not sent', {
      messageId: payload?.meta?.messageId
    });
    throw new Error('Invalid payload');
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

  // A failed POST throws and leaves the item in the durable queue for retry.
  await axios.post(
    config.forwarder.endpoint,
    body,
    {
      headers,
      timeout: config.forwarder.timeoutSeconds * 1000
    }
  );

  logger.info('forwarder', 'send', 'payload forwarded', {
    messageId: payload?.meta?.messageId,
    format: config.forwarder.format
  });

  try {
    // Archiving is intentionally best-effort after a successful forward; a
    // failed archive should not cause duplicate delivery downstream.
    await archivePayload(payload);

    logger.info('archive', 'store', 'payload archived', {
      messageId: payload?.meta?.messageId
    });
  } catch (err) {
    logger.error('archive', 'store', 'payload forwarded but archive failed', {
      messageId: payload?.meta?.messageId,
      error: err.message
    });
  }
}

module.exports = { forward };
