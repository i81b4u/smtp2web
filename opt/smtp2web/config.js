const path = require('path');

// Allow tests and local runs to point at a different config file while keeping
// the production default aligned with the packaged systemd unit.
const configPath = process.env.SMTP2WEB_CONFIG || '/etc/smtp2web/config.json';
const config = require(path.resolve(configPath));

// Keep new settings compatible with existing operator-managed configuration
// files. Validate the IANA name at startup, before any queue processing relies
// on it.
config.debug ??= {};
config.debug.saveRawMessages ??= false;
config.debug.rawMessagePath ??= '/var/lib/smtp2web/debug';

config.archive ??= {};
config.archive.timezone ??= 'UTC';

if (typeof config.debug.saveRawMessages !== 'boolean') {
  throw new Error('debug.saveRawMessages must be a boolean');
}
if (typeof config.debug.rawMessagePath !== 'string' || !config.debug.rawMessagePath) {
  throw new Error('debug.rawMessagePath must be a non-empty path');
}
if (typeof config.archive.timezone !== 'string' || !config.archive.timezone) {
  throw new Error('archive.timezone must be a non-empty IANA timezone name');
}

try {
  new Intl.DateTimeFormat('en-CA', { timeZone: config.archive.timezone });
} catch (err) {
  throw new Error(`archive.timezone is invalid: ${config.archive.timezone}`);
}

module.exports = config;
