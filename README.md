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

- Invalid JSON spool files are moved to `spool/quarantine`.
- Repeated delivery failures are moved to `spool/failed` after
  `queue.maxAttempts`.
- Moving a failed JSON file back into the active spool is treated as a manual
  replay. Retry metadata is reset, while a preserved `forwardedAt` marker
  prevents duplicate HTTP delivery after an archive-only failure.

## Archive Compression

Delivered messages are archived by date under:

```text
/var/lib/smtp2web/archive/YYYY-MM-DD/
```

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
