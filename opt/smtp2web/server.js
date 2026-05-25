const { SMTPServer } = require('smtp-server');
const fs = require('fs');
const config = require('./config');
const { parseMail } = require('./mail');
const { enqueue, startQueueProcessor } = require('./queue');
const { ensureTlsCertificates } = require('./certs');
const logger = require('./logger');

// Default to a bounded message size even if older config files omit the setting.
const DEFAULT_MAX_MESSAGE_BYTES = 25 * 1024 * 1024;

function getMaxMessageBytes() {
  const configured = config.smtp.maxMessageBytes ?? config.smtp.sizeLimitBytes;

  if (configured === undefined) {
    return DEFAULT_MAX_MESSAGE_BYTES;
  }

  const parsed = Number(configured);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error('smtp.maxMessageBytes must be a positive integer');
  }

  return parsed;
}

// Ensure TLS material exists before smtp-server reads key/cert from disk.
ensureTlsCertificates(config, logger);

const maxMessageBytes = getMaxMessageBytes();

// STARTTLS is used instead of implicit TLS, so the server advertises plain SMTP
// first and then requires TLS before accepting mail when configured to do so.
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
    // Reject mail transactions that try to submit before STARTTLS completed.
    if (config.smtp.requireTLS && !session.secure) {
      return callback(new Error('Must issue STARTTLS first'));
    }
    callback();
  },

  onData(stream, session, callback) {
    const chunks = [];
    let receivedBytes = 0;
    let finished = false;

    // smtp-server expects the DATA callback exactly once.
    function finish(err) {
      if (finished) return;
      finished = true;
      callback(err || null);
    }

    stream.on('data', c => {
      receivedBytes += c.length;

      // Enforce the local size limit while streaming so oversized messages do
      // not have to be fully buffered or parsed before being rejected.
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
        // The message is now within the configured size limit, so parse it,
        // attach SMTP session metadata, and hand it to the durable queue.
        const buffer = Buffer.concat(chunks);
        const payload = await parseMail(buffer);

        payload.session = {
          remoteAddress: session.remoteAddress,
          tls: session.secure
        };

        logger.info('smtp', 'receive', 'connection initiated', {
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
