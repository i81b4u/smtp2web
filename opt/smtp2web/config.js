const path = require('path');

// Allow tests and local runs to point at a different config file while keeping
// the production default aligned with the packaged systemd unit.
const configPath = process.env.SMTP2WEB_CONFIG || '/etc/smtp2web/config.json';

module.exports = require(path.resolve(configPath));
