# smtp2web – Installation & Setup Guide

`smtp2web` is a TLS-enabled SMTP ingestion service that converts
incoming emails into structured JSON (or XML at the forwarding edge)
and forwards them to an HTTP(S) endpoint. The service is designed
to be robust, auditable, and easy to operate.

This document describes how to install and run smtp2web.

---

## 1. Prerequisites
### Operating system
- Linux (systemd-based recommended)

### Required software
- Node.js (LTS recommended, v18+)
- npm
- OpenSSL (for TLS certificates)
- firewalld/nftables (or equivalent firewall)

### Privileges
- Root access for installation
- The service itself runs as a dedicated unprivileged user

---

## 2. Filesystem layout
The installation follows FHS / LSB conventions.

### Code
/opt/smtp2web

### Configuration
/etc/smtp2web/config.json

### Certificates
/etc/smtp2web/certs

The service generates a self-signed SMTP certificate at startup when
the configured key or certificate file is missing or empty. Production
installations should replace generated files with certificates from the
organisation's CA. The private key must be readable by the
`smtp2web` service user.

### Runtime data
/var/lib/smtp2web

### Logs
/var/log/smtp2web.log

---

## 3. Installation steps
### 3.1 Clone the repository
```
git clone https://github.com/i81b4u/smtp2web.git
cd smtp2web
```


## 3.2 Install smtp2web
```
sudo ./install.sh
```

## 3.3 Get the needed node modules
```
sudo su -s /bin/bash smtp2web -c 'cd /opt/smtp2web && npm ci --omit=dev'
```

## 3.4 Modify the default configuration
```
sudo editor /etc/smtp2web/config.json
```

Pay special attention to:
- SMTP listen address and port
- Maximum SMTP message size (`smtp.maxMessageBytes`)
- TLS certificate paths
- TLS subject alternative names for generated self-signed certificates
- Forwarder endpoint
- Archive settings


## 3.5 Firewall configuration (nftables example)
Allow SMTP submission on port 2525 (as defined in config.json) from
trusted hosts only. The following example is based on firewalld where
an xml file, like smtp2web.xml is created in /etc/firewalld/zones.

```
<?xml version="1.0" encoding="utf-8"?>
<zone target="DROP">
  <port port="2525" protocol="tcp"/>
  <forward-port port="25" protocol="tcp" to-port="2525"/>
  <source address="192.168.1.0/24"/>
</zone>
```

Adjust the source addresses as required.


## 3.6 Start smtp2web
```
sudo systemctl daemon-reload
sudo systemctl enable --now smtp2web.service
sudo systemctl enable --now zip-smtp2web-archives.timer
```

---

## 4. Verification
### SMTP test
Use a tool like `swaks` to submit a test email.
Example:
```
swaks --to=user@company.internal --tls --server=smtp2web.company.internal
```

### Queue behavior
- Messages appear in `/var/lib/smtp2web/spool`
- Successfully delivered messages are archived when archiving is enabled
- Failed deliveries are retried, then moved to the failed queue after
  `queue.maxAttempts`

### Logs
Inspect structured logs:
```
tail -f /var/log/smtp2web.log
```

---

## 5. Archiving and retention
Successfully delivered messages are archived by day under:
/var/lib/smtp2web/archive/YYYY-MM-DD/

Compression and retention are handled by a script that can be
executed via cron or a systemd timer and is located here:
```
/usr/local/scripts/zip-smtp2web-archives.sh
```

---

## 6. Recovery & replay
Archived JSON files can be replayed manually by moving/copying them
to the spool directory.

Files moved from the failed queue back into the active spool are treated
as manual replays. The retry counter and failure metadata are reset
automatically. If a message had already been forwarded successfully but
failed during archiving, its `forwardedAt` marker is preserved so replay
retries archiving without sending a duplicate HTTP request.

---

## 7. Notes
- JSON is the canonical internal format
- XML is generated only at the forwarding edge (if enabled)
- The queue is the single source of truth
- Messages are only removed after they are successfully sent and, when
  enabled, archived

---

**This repository was developed with assistance from OpenAI Codex for coding, review, and troubleshooting.**

End of document.
