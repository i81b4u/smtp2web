# smtp2web

`smtp2web` is a TLS-enabled SMTP ingestion service. It accepts email over
SMTP, parses each message into structured JSON, queues it durably on disk, and
forwards it to an HTTP or HTTPS endpoint. XML can be generated at the forwarding
edge when a receiver requires it.

The deployed application lives in `/opt/smtp2web`. Configuration, certificates,
runtime data, and logs live outside this directory:

```text
/etc/smtp2web/config.json
/etc/smtp2web/certs/
/var/lib/smtp2web/spool/
/var/lib/smtp2web/spool/failed/
/var/lib/smtp2web/spool/quarantine/
/var/lib/smtp2web/archive/
/var/log/smtp2web.log
```

Systemd units:

```text
smtp2web.service
zip-smtp2web-archives.service
zip-smtp2web-archives.timer
```

## Requirements

- Linux with systemd
- Node.js 20.19.0 or newer
- npm
- OpenSSL
- `zip` and `flock` for archive compression

## Runtime Commands

Install production dependencies after deploying or updating files:

```sh
sudo su -s /bin/bash smtp2web -c 'cd /opt/smtp2web && npm ci --omit=dev'
```

Start and inspect the service:

```sh
sudo systemctl daemon-reload
sudo systemctl enable --now smtp2web.service
sudo systemctl status smtp2web.service
```

Enable archive compression:

```sh
sudo systemctl enable --now zip-smtp2web-archives.timer
systemctl list-timers zip-smtp2web-archives.timer
```

Tail logs:

```sh
sudo tail -f /var/log/smtp2web.log
journalctl -u smtp2web.service -f
```

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

## Queue And Replay

Incoming messages are written to `/var/lib/smtp2web/spool` before forwarding.
Invalid JSON files are moved to `spool/quarantine`. Messages that exceed
`queue.maxAttempts` are moved to `spool/failed`.

Moving a failed JSON file back into the active spool is treated as a manual
replay. Retry metadata is reset, while a preserved `forwardedAt` marker prevents
duplicate HTTP delivery after an archive-only failure.

## Archive Compression

Delivered messages are archived by date under:

```text
/var/lib/smtp2web/archive/YYYY-MM-DD/
```

`/usr/local/bin/zip-smtp2web-archives.sh` compresses archived JSON files into
date-local zip files and removes archive directories older than its retention
window. The installed systemd timer runs this daily.
