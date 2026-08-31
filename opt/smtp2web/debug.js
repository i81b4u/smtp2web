const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');

async function saveRawMessage(rawMessagePath, buffer) {
  // The caller supplies the SMTP DATA buffer directly, before mailparser gets
  // a chance to normalize headers or decode attachments.
  await fs.mkdir(rawMessagePath, { recursive: true, mode: 0o700 });
  await fs.chmod(rawMessagePath, 0o700);

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const file = path.join(rawMessagePath, `${timestamp}_${crypto.randomUUID()}.eml`);
  await fs.writeFile(file, buffer, { mode: 0o600, flag: 'wx' });
  await fs.chmod(file, 0o600);
  return file;
}

async function saveRawMessageIfEnabled(debug, buffer) {
  if (!debug.saveRawMessages) return null;
  return saveRawMessage(debug.rawMessagePath, buffer);
}

module.exports = { saveRawMessage, saveRawMessageIfEnabled };
