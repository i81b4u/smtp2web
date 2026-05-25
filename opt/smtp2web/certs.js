const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

// Publicly trusted certificates are preferred, but this fallback keeps first
// start deterministic for isolated/internal deployments.
const DEFAULT_CERT_DAYS = 397;

function hasUsableFile(file) {
  try {
    return fs.statSync(file).isFile() && fs.statSync(file).size > 0;
  } catch {
    return false;
  }
}

function certSubjectAltNames(config) {
  // Subject Alternative Names are required by modern TLS clients. If no SANs
  // are configured, use the SMTP greeting name or the local hostname.
  const configured = config.smtp?.tls?.subjectAltNames;
  const names = Array.isArray(configured) && configured.length
    ? configured
    : [config.smtp?.name || os.hostname()];

  return names
    .filter(Boolean)
    .map(name => String(name).trim())
    .filter(Boolean);
}

function altNameLine(name) {
  // OpenSSL separates DNS and IP SAN entries; simple detection covers IPv4 and
  // IPv6 literals while treating everything else as a DNS name.
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(name) || name.includes(':')) {
    return { kind: 'IP', value: name };
  }

  return { kind: 'DNS', value: name };
}

function writeOpenSslConfig(file, config) {
  // Generate a temporary OpenSSL config so the certificate includes SANs and
  // server-auth key usage instead of relying on OpenSSL defaults.
  const altNames = certSubjectAltNames(config)
    .map((name, index) => {
      const altName = altNameLine(name);
      return `${altName.kind}.${index + 1} = ${altName.value}`;
    })
    .join('\n');

  fs.writeFileSync(file, [
    '[req]',
    'prompt = no',
    'distinguished_name = dn',
    'x509_extensions = v3_req',
    '',
    '[dn]',
    `CN = ${config.smtp?.name || os.hostname()}`,
    '',
    '[v3_req]',
    'basicConstraints = critical,CA:FALSE',
    'keyUsage = critical,digitalSignature,keyEncipherment',
    'extendedKeyUsage = serverAuth',
    'subjectAltName = @alt_names',
    '',
    '[alt_names]',
    altNames,
    ''
  ].join('\n'), { mode: 0o600 });
}

function resolveUserId(name) {
  return Number(execFileSync('id', ['-u', name], { encoding: 'utf8' }).trim());
}

function resolveGroupId(name, fallbackUser) {
  try {
    const group = execFileSync('getent', ['group', name], { encoding: 'utf8' }).trim();
    return Number(group.split(':')[2]);
  } catch {
    return Number(execFileSync('id', ['-g', fallbackUser], { encoding: 'utf8' }).trim());
  }
}

function applyGeneratedFileOwnership(file) {
  // ExecStartPre runs as root in systemd, then hands the generated files to the
  // unprivileged service account that will read them during normal startup.
  if (typeof process.getuid !== 'function' || process.getuid() !== 0) return;

  const user = process.env.SMTP2WEB_CERT_USER || 'smtp2web';
  const group = process.env.SMTP2WEB_CERT_GROUP || user;
  const uid = resolveUserId(user);
  const gid = resolveGroupId(group, user);

  fs.chownSync(file, uid, gid);
}

function ensureTlsCertificates(config, logger = console) {
  const keyFile = config.smtp?.tls?.key;
  const certFile = config.smtp?.tls?.cert;

  if (!keyFile || !certFile) {
    throw new Error('SMTP TLS key and cert paths must be configured');
  }

  if (hasUsableFile(keyFile) && hasUsableFile(certFile)) {
    // Do not replace operator-provided certificates. When running as root,
    // normalize ownership and permissions so the service can still start.
    if (typeof process.getuid === 'function' && process.getuid() === 0) {
      applyGeneratedFileOwnership(keyFile);
      applyGeneratedFileOwnership(certFile);
      fs.chmodSync(keyFile, 0o440);
      fs.chmodSync(certFile, 0o640);
    }
    return false;
  }

  fs.mkdirSync(path.dirname(keyFile), { recursive: true, mode: 0o750 });
  fs.mkdirSync(path.dirname(certFile), { recursive: true, mode: 0o750 });

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'smtp2web-certs-'));
  const tmpKey = path.join(tmpDir, 'private.pem');
  const tmpCert = path.join(tmpDir, 'public.pem');
  const opensslConfig = path.join(tmpDir, 'openssl.cnf');

  try {
    writeOpenSslConfig(opensslConfig, config);

    // Keep the key unencrypted because smtp-server reads it unattended at boot.
    execFileSync('openssl', [
      'req',
      '-x509',
      '-newkey',
      'rsa:3072',
      '-sha256',
      '-days',
      String(config.smtp?.tls?.selfSignedDays || DEFAULT_CERT_DAYS),
      '-nodes',
      '-keyout',
      tmpKey,
      '-out',
      tmpCert,
      '-config',
      opensslConfig
    ], { stdio: 'ignore' });

    fs.copyFileSync(tmpKey, keyFile);
    fs.copyFileSync(tmpCert, certFile);
    applyGeneratedFileOwnership(keyFile);
    applyGeneratedFileOwnership(certFile);
    fs.chmodSync(keyFile, 0o440);
    fs.chmodSync(certFile, 0o640);

    const caFile = config.smtp?.tls?.ca || process.env.NODE_EXTRA_CA_CERTS;
    if (caFile && !hasUsableFile(caFile)) {
      // For self-signed deployments, rootca.pem is the trust anchor clients can
      // distribute if they need to verify this generated certificate.
      fs.mkdirSync(path.dirname(caFile), { recursive: true, mode: 0o750 });
      fs.copyFileSync(tmpCert, caFile);
      applyGeneratedFileOwnership(caFile);
      fs.chmodSync(caFile, 0o640);
    }

    logger.warn?.('tls', 'certificates', 'generated self-signed SMTP certificate', {
      key: keyFile,
      cert: certFile
    });

    return true;
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

module.exports = { ensureTlsCertificates };

if (require.main === module) {
  const config = require('./config');
  const logger = require('./logger');

  ensureTlsCertificates(config, logger);
}
