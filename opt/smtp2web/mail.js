const { simpleParser } = require('mailparser');

async function parseMail(buffer) {
  const mail = await simpleParser(buffer);

  mail.attachments?.forEach(att => {
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
