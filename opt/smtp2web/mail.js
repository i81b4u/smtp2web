const { simpleParser } = require('mailparser');

async function parseMail(buffer) {
  // mailparser turns the raw RFC 5322 message into a structured object with
  // normalized headers, body text/html, and attachment metadata.
  const mail = await simpleParser(buffer);

  mail.attachments?.forEach(att => {
    // Buffers do not serialize usefully to JSON, so attachment content is
    // encoded before the message is placed on disk or sent over HTTP.
    att.content = att.content.toString('base64');
  });

  return {
    meta: {
      receivedAt: new Date().toISOString()
    },
    mail
  };
}

module.exports = { parseMail };
