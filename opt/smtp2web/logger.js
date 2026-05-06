const fs = require('fs');
const path = require('path');
const config = require('./config');

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

  try {
    fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });
    fs.appendFileSync(LOG_FILE, JSON.stringify(entry) + '\n');
  } catch (err) {
    process.stderr.write(JSON.stringify({
      ...entry,
      logError: err.message
    }) + '\n');
  }
}

module.exports = {
  info: (c, a, m, e) => log('INFO', c, a, m, e),
  warn: (c, a, m, e) => log('WARN', c, a, m, e),
  error: (c, a, m, e) => log('ERROR', c, a, m, e)
};
