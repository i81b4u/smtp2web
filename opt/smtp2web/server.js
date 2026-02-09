const { SMTPServer } = require('smtp-server');
const fs = require('fs');
const config = require('/etc/smtp2web/config.json');
const { parseMail } = require('/opt/smtp2web/mail');
const { enqueue } = require('/opt/smtp2web/queue');
const logger = require('/opt/smtp2web/logger');

const server = new SMTPServer({
  secure: false,
  requireTLS: config.smtp.requireTLS,
  name: config.smtp.name,

  key: fs.readFileSync(config.smtp.tls.key),
  cert: fs.readFileSync(config.smtp.tls.cert),

  tls: {
    minVersion: config.smtp.tls.minVersion,
    maxVersion: config.smtp.tls.maxVersion,
    ciphers: config.smtp.tls.ciphers.join(':'),
    honorCipherOrder: true
  },

  disabledCommands: ['AUTH'],

  onMailFrom(address, session, callback) {
    if (config.smtp.requireTLS && !session.secure) {
      return callback(new Error('Must issue STARTTLS first'));
    }
    callback();
  },

  onData(stream, session, callback) {
    const chunks = [];

    stream.on('data', c => chunks.push(c));
    stream.on('end', async () => {
      try {
        const buffer = Buffer.concat(chunks);
        const payload = await parseMail(buffer);

        payload.session = {
          remoteAddress: session.remoteAddress,
          tls: session.secure
        };

        await enqueue(payload);

        logger.info('smtp', 'receive', 'mail accepted', {
          remote: session.remoteAddress
        });

        callback(null);
      } catch (err) {
        logger.error('smtp', 'receive', 'mail rejected', {
          error: err.message
        });
        callback(err);
      }
    });
  }
});

server.listen(config.smtp.port, config.smtp.listen, () => {
  logger.info('smtp', 'listen', 'smtp server started', {
    address: `${config.smtp.listen}:${config.smtp.port}`
  });
});
