const { SMTPServer } = require('smtp-server');
const fs = require('fs');
const config = require('./config');
const { parseMail } = require('./mail');
const { enqueue, startQueueProcessor } = require('./queue');
const logger = require('./logger');

const maxMessageBytes = config.smtp.maxMessageBytes || config.smtp.sizeLimitBytes;

const server = new SMTPServer({
  secure: false,
  requireTLS: config.smtp.requireTLS,
  name: config.smtp.name,
  size: maxMessageBytes,

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
    let receivedBytes = 0;
    let finished = false;

    function finish(err) {
      if (finished) return;
      finished = true;
      callback(err || null);
    }

    stream.on('data', c => {
      receivedBytes += c.length;

      if (maxMessageBytes && receivedBytes > maxMessageBytes) {
        logger.warn('smtp', 'receive', 'message exceeded size limit', {
          remote: session.remoteAddress,
          size: receivedBytes,
          limit: maxMessageBytes
        });
        stream.resume();
        return finish(new Error('Message exceeds size limit'));
      }

      chunks.push(c);
    });
    stream.on('error', err => {
      logger.error('smtp', 'receive', 'data stream failed', {
        remote: session.remoteAddress,
        error: err.message
      });
      finish(err);
    });
    stream.on('end', async () => {
      if (finished) return;

      try {
        const buffer = Buffer.concat(chunks);
        const payload = await parseMail(buffer);

        payload.session = {
          remoteAddress: session.remoteAddress,
          tls: session.secure
        };

        logger.info('smtp', 'receive', 'mail received', {
          remote: session.remoteAddress
        });

        await enqueue(payload);

        logger.info('smtp', 'receive', 'mail accepted', {
          remote: session.remoteAddress
        });

        finish();
      } catch (err) {
        logger.error('smtp', 'receive', 'mail rejected', {
          error: err.message
        });
        finish(err);
      }
    });
  }
});

function startServer() {
  startQueueProcessor();

  server.listen(config.smtp.port, config.smtp.listen, () => {
    logger.info('smtp', 'listen', 'smtp server started', {
      address: `${config.smtp.listen}:${config.smtp.port}`
    });
  });
}

if (require.main === module) {
  startServer();
}

module.exports = { server, startServer };
