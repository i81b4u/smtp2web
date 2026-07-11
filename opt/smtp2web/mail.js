const { simpleParser } = require('mailparser');
const { SCHEMA_VERSION } = require('./validator-core');

async function parseMail(buffer) {
  // mailparser turns the raw RFC 5322 message into a structured object with
  // normalized headers, body text/html, and attachment metadata.
  const mail = await simpleParser(buffer);

  if (mail.headers instanceof Map) {
    // Map values are lost by JSON.stringify, so normalize headers before the
    // payload is written to the queue or forwarded.
    mail.headers = Object.fromEntries(mail.headers);
  }

  mail.attachments?.forEach(att => {
    // Buffers do not serialize usefully to JSON, so attachment content is
    // encoded before the message is placed on disk or sent over HTTP.
    att.content = att.content.toString('base64');
  });

  return {
    meta: {
      schemaVersion: SCHEMA_VERSION,
      receivedAt: new Date().toISOString()
    },
    mail
  };
}

module.exports = { parseMail };
