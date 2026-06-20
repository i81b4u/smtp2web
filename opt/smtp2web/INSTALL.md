# Installing smtp2web

This file is installed with the application for operator reference. When
installing from the repository, run `./install.sh` from the repository root.

## Prerequisites

- Linux system with systemd
- Root privileges
- Node.js 20.19.0 or newer
- npm
- OpenSSL
- `zip`
- `flock`, usually provided by `util-linux`

## Standard Installation

From the repository root:

```sh
sudo ./install.sh
```

The installer creates the `smtp2web` system user and group if needed, installs
files under `/etc`, `/opt`, `/usr/local/bin`, and `/var`, and applies the
intended ownership and permissions.

Install production dependencies in the deployed application directory:

```sh
sudo su -s /bin/bash smtp2web -c 'cd /opt/smtp2web && npm ci --omit=dev'
```

Review and edit configuration:

```sh
sudo editor /etc/smtp2web/config.json
```

At minimum, check:

- `smtp.name`
- `smtp.listen`
- `smtp.port`
- `smtp.requireTLS`
- `smtp.maxMessageBytes`
- `smtp.tls.subjectAltNames`
- `forwarder.endpoint`
- `forwarder.format`
- `queue.path`
- `queue.failedPath`
- `archive.enabled`
- `archive.path`

## Start Services

```sh
sudo systemctl daemon-reload
sudo systemctl enable --now smtp2web.service
sudo systemctl enable --now zip-smtp2web-archives.timer
```

Installed units:

```text
smtp2web.service
zip-smtp2web-archives.service
zip-smtp2web-archives.timer
```

Check service and timer status:

```sh
sudo systemctl status smtp2web.service
systemctl list-timers zip-smtp2web-archives.timer
```

## TLS Certificates

The default TLS certificate paths are:

```text
/etc/smtp2web/certs/private.pem
/etc/smtp2web/certs/public.pem
/etc/smtp2web/certs/rootca.pem
```

Certificate files are not included in a fresh installation. On first startup,
`/opt/smtp2web/certs.js` creates self-signed certificate files if usable files
are not already present. Operator-provided certificates can also be placed at
the configured paths before starting the service.

## Firewall

Allow the configured SMTP port from trusted sources only. The default
configuration listens on TCP port `2525`.

Example with UFW:

```sh
sudo ufw allow from <trusted-network> to any port 2525 proto tcp
```

## Verification

Check installed ownership and permissions:

```sh
namei -l /etc/smtp2web/config.json
namei -l /etc/smtp2web/certs
namei -l /opt/smtp2web/server.js
namei -l /var/lib/smtp2web/spool
namei -l /var/log/smtp2web.log
```

Inspect logs:

```sh
sudo tail -f /var/log/smtp2web.log
journalctl -u smtp2web.service -f
```

Submit a test message with a tool such as `swaks`, adjusted for your configured
host and port:

```sh
swaks --server <smtp-host> --port 2525 --tls --to test@example.org
```

## Archive Compression

Successfully delivered messages are archived by day under:

```text
/var/lib/smtp2web/archive/YYYY-MM-DD/
```

The installed archive script is:

```text
/usr/local/bin/zip-smtp2web-archives.sh
```

The systemd timer runs it daily. The script writes structured log lines to
`/var/log/smtp2web.log`, compresses archived JSON files into zip files, and
removes archive directories older than its configured retention window.

## Recovery And Replay

Archived JSON files can be replayed manually by copying them to the active spool
directory:

```text
/var/lib/smtp2web/spool/
```

Files moved from the failed queue back into the active spool are treated as
manual replays. The retry counter and failure metadata are reset automatically.
If a message had already been forwarded successfully but failed during
archiving, its `forwardedAt` marker is preserved so replay retries archiving
without sending a duplicate HTTP request.

## Updating

From the repository root:

```sh
git pull
sudo ./install.sh
sudo systemctl daemon-reload
sudo su -s /bin/bash smtp2web -c 'cd /opt/smtp2web && npm ci --omit=dev'
sudo systemctl restart smtp2web.service
```
