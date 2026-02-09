const fs = require('fs');
const config = require('/etc/smtp2web/config.json');

const LOG_FILE = config.log.path;

function log(level, component, action, message, extra = {}) {
  const entry = {
    ts: new Date().toISOString(),
    level,
    component,
    action,
    message,
    ...extra
  };

  fs.appendFileSync(LOG_FILE, JSON.stringify(entry) + '\n');
}

module.exports = {
  info: (c, a, m, e) => log('INFO', c, a, m, e),
  warn: (c, a, m, e) => log('WARN', c, a, m, e),
  error: (c, a, m, e) => log('ERROR', c, a, m, e)
};
