const path = require('path');

const configPath = process.env.SMTP2WEB_CONFIG || '/etc/smtp2web/config.json';

module.exports = require(path.resolve(configPath));
