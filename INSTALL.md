# Installing smtp2web

This repository contains a root-relative filesystem tree and an installer that
copies it into the expected system locations.

Run the installer from the repository root.

## Prerequisites

- Linux system with systemd
- Root privileges
- Node.js 18 or newer
- npm
- OpenSSL
- git

## Install from a clone

Clone the repository and enter the repository root:

```sh
git clone <repository-url> smtp2web
cd smtp2web
```

Run the installer as root:

```sh
sudo ./install.sh
```

The installer creates the `smtp2web` system user and group if needed, installs
the files under `/etc`, `/opt`, `/usr/local/bin`, and `/var`, and applies the
intended ownership and permissions.

The service user is created with:

```text
home:  /var/lib/smtp2web
shell: /usr/sbin/nologin
```

## Configure smtp2web

Review and edit:

```sh
sudo editor /etc/smtp2web/config.json
```

At minimum, check:

- `smtp.name`
- `smtp.listen`
- `smtp.port`
- `smtp.tls.subjectAltNames`
- `forwarder.endpoint`
- archive and queue paths

The default TLS certificate paths are:

```text
/etc/smtp2web/certs/private.pem
/etc/smtp2web/certs/public.pem
```

Certificate files are not included in a fresh installation. On first startup,
`/opt/smtp2web/certs.js` creates self-signed certificate files if usable files
are not already present. Operator-provided certificates can also be placed at
the configured paths before starting the service.

## Install Node.js dependencies

Install production dependencies in the deployed application directory:

```sh
sudo su -s /bin/bash smtp2web -c 'cd /opt/smtp2web && npm ci --omit=dev'
```

If the installed npm version does not support `--omit=dev`, use:

```sh
sudo su -s /bin/bash smtp2web -c 'cd /opt/smtp2web && npm install --production'
```

## Reload systemd

The installer places systemd units under `/etc/systemd/system`, so reload
systemd after installation:

```sh
sudo systemctl daemon-reload
```

This repository installs the main service and archive compression timer units:

```text
smtp2web.service
zip-smtp2web-archives.service
zip-smtp2web-archives.timer
```

Enable and start smtp2web:

```sh
sudo systemctl enable --now smtp2web.service
```

Enable and start the timer if archive compression should run daily:

```sh
sudo systemctl enable --now zip-smtp2web-archives.timer
```

Check the timer:

```sh
systemctl status zip-smtp2web-archives.timer
systemctl list-timers zip-smtp2web-archives.timer
```

## Running smtp2web

The normal service command is:

```sh
sudo systemctl status smtp2web.service
```

For a manual foreground test run, stop the systemd service first and then run:

```sh
sudo systemctl stop smtp2web.service
cd /opt/smtp2web
sudo -u smtp2web node server.js
```

## Firewall

Allow the configured SMTP port from trusted sources only. The default
configuration listens on TCP port `2525`.

Example with UFW:

```sh
sudo ufw allow from <trusted-network> to any port 2525 proto tcp
```

Adjust this for the firewall used on the target system.

## Logs and runtime data

Log file:

```text
/var/log/smtp2web.log
```

Runtime data:

```text
/var/lib/smtp2web/spool
/var/lib/smtp2web/spool/failed
/var/lib/smtp2web/spool/quarantine
/var/lib/smtp2web/archive
```

Log rotation is installed at:

```text
/etc/logrotate.d/smtp2web
```

## Basic verification

Check installed ownership and permissions:

```sh
namei -l /etc/smtp2web/config.json
namei -l /opt/smtp2web/server.js
namei -l /var/lib/smtp2web/spool
namei -l /var/log/smtp2web.log
```

Check that the application starts:

```sh
sudo systemctl status smtp2web.service
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

## Updating an existing installation

Pull the latest repository changes and rerun the installer:

```sh
git pull
sudo ./install.sh
sudo systemctl daemon-reload
```

Then reinstall Node.js dependencies if `package.json` or `package-lock.json`
changed:

```sh
sudo su -s /bin/bash smtp2web -c 'cd /opt/smtp2web && npm ci --omit=dev'
```

Restart the main smtp2web process according to how it is supervised on the
target system:

```sh
sudo systemctl restart smtp2web.service
```
