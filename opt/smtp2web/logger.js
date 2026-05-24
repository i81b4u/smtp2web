const fs = require('fs');
const path = require('path');
const config = require('./config');

const LOG_FILE = config.log.path;

function log(level, component, action, message, extra = {}) {
  // One JSON object per line keeps logs easy to parse with journalctl, jq, or
  // traditional file-based log collectors.
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
    // If the configured log file is unavailable, keep the event visible through
    // stderr so systemd/journald can still capture it.
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
