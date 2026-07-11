# smtp2web

`smtp2web` is a TLS-enabled SMTP ingestion service. It accepts email over
SMTP, parses each message into structured JSON, queues it durably on disk, and
forwards it to an HTTP or HTTPS endpoint. XML can be generated at the forwarding
edge when a receiver requires it.

The repository is laid out as a root-relative Linux filesystem tree plus
`install.sh`, which installs the files into their production locations.

## Installed Layout

```text
/etc/smtp2web/config.json
/etc/smtp2web/certs/
/opt/smtp2web/
/usr/local/bin/zip-smtp2web-archives.sh
/var/lib/smtp2web/spool/
/var/lib/smtp2web/spool/failed/
/var/lib/smtp2web/spool/quarantine/
/var/lib/smtp2web/archive/
/var/log/smtp2web/
```

Systemd units are installed under `/etc/systemd/system`:

```text
smtp2web.service
zip-smtp2web-archives.service
zip-smtp2web-archives.timer
```

## Requirements

- Linux with systemd
- Root privileges for installation
- Node.js 20.19.0 or newer
- npm
- OpenSSL
- `zip` and `flock` for archive compression
- A firewall that can restrict the SMTP listener to trusted sources

## Quick Install

```sh
git clone https://github.com/i81b4u/smtp2web.git
cd smtp2web
sudo ./install.sh
sudo su -s /bin/bash smtp2web -c 'cd /opt/smtp2web && npm ci --omit=dev'
sudo editor /etc/smtp2web/config.json
sudo systemctl daemon-reload
sudo systemctl enable --now smtp2web.service
sudo systemctl enable --now zip-smtp2web-archives.timer
```

See [INSTALL.md](INSTALL.md) for detailed installation, update, firewall, and
verification steps.

## TLS Certificates

The default configuration uses:

```text
/etc/smtp2web/certs/private.pem
/etc/smtp2web/certs/public.pem
/etc/smtp2web/certs/rootca.pem
```

If the configured key or certificate is missing or empty, `certs.js` generates a
self-signed SMTP certificate at startup. Production deployments should replace
the generated certificate with material from the organisation's CA. The private
key is installed as `root:smtp2web` with mode `0440`, so it is readable by the
service group and not world-readable.

## Queue And Delivery

Incoming messages are written to `/var/lib/smtp2web/spool` before forwarding.
The queue file is the source of truth until HTTP delivery succeeds and, when
enabled, archiving succeeds.

- Invalid JSON or structurally invalid spool files are moved to
  `spool/quarantine` without consuming delivery retries.
- Repeated delivery failures are moved to `spool/failed` after
  `queue.maxAttempts`.
- Moving a failed JSON file back into the active spool is treated as a manual
  replay. Retry metadata is reset, while a preserved `forwardedAt` marker
  prevents duplicate HTTP delivery after an archive-only failure.

## HTTP Delivery Semantics

By default, smtp2web provides at-least-once delivery: any HTTP 2xx response,
including `200` and `202`, is treated as receiver acceptance. A network failure
after a receiver processes a request can therefore result in a retry and a
duplicate delivery.

Receivers that support deduplication can opt in by setting
`forwarder.idempotency.enabled` to `true`. smtp2web then sends the stable queue
UUID in the `Idempotency-Key` header (or the configured
`forwarder.idempotency.header`). The receiver must record that value and return
a 2xx response for repeats without processing them again. This setting is off
by default, so existing receivers receive the same requests as before.

## Payload Validation

smtp2web validates its own versioned payload contract before forwarding. It
requires durable metadata, a parsed mail object, and TLS session metadata, but
deliberately does not require or RFC-validate optional mail headers such as
`From`, `To`, or `Subject`. That keeps legitimate device-generated mail
compatible while still quarantining corrupt or manually malformed spool files.

New messages use schema version 1. Queue files created by earlier releases,
which have no schema version marker, remain valid for replay.

## Archive Compression

Delivered messages are archived by date under:

```text
/var/lib/smtp2web/archive/YYYY-MM-DD/
```

Archive files are written atomically, so the compression timer only ever sees
complete JSON payloads.

`/usr/local/bin/zip-smtp2web-archives.sh` compresses archived JSON files into
date-local zip files and removes archive directories older than its retention
window. The installed systemd timer runs this daily.

## Logs

Application logs are newline-delimited JSON in:

```text
/var/log/smtp2web/smtp2web.log
```

Log rotation is configured by `/etc/logrotate.d/smtp2web`.

## Development Note

This repository was developed with assistance from OpenAI Codex for coding,
review, and troubleshooting.

Run the structural validation tests from the deployed application directory:

```sh
npm test
```

## Integration Tests

The integration suite is a black-box test of the SMTP and HTTP boundaries. It
starts an isolated smtp2web process with temporary TLS certificates, spool,
archive, log paths, and loopback ports. It uses `swaks` as an SMTP client and a
bundled Python HTTP listener as a controllable API gateway; it does not need
root, systemd, or a running production installation, and does not touch the
configured service or its data.

Prerequisites are Node.js dependencies (`npm ci`), Python 3, `swaks`, `curl`,
and OpenSSL. Run it from `/opt/smtp2web` or this repository's application
directory:

```sh
npm run test:integration
```

The runner reports these scenarios as it executes them:

1. STARTTLS mail forwarded after HTTP `200`.
2. Plain SMTP rejected when TLS is required.
3. HTTP `202` accepted as asynchronous receiver acceptance.
4. HTTP `500` retained and retried until a later `200`.
5. Corrupt spool JSON moved directly to quarantine.
6. Opt-in idempotency header matches the stable message UUID.

Temporary files are removed at the end of a run. To retain the generated
configuration, certificates, logs, and spool for troubleshooting, run:

```sh
SMTP2WEB_TEST_KEEP=1 npm run test:integration
```
