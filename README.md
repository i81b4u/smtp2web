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

## 2. Service user
The service must run as a dedicated system user.
The following line is an example of an entry in /etc/passwd:
smtp2web:x:999:988::/var/lib/smtp2web:/usr/sbin/nologin

---

## 3. Filesystem layout
The installation follows FHS / LSB conventions.

### Code
/opt/smtp2web

### Configuration
/etc/smtp2web/config.json

### Certificates
/etc/smtp2web/certs

### Runtime data
/var/lib/smtp2web

### Logs
/var/log/smtp2web.log

---

## 4. Installation steps
### 4.1 Download zip file
Download the zip file from github and extract all files.
Make sure all files have the correct owners and permissions.

chown root:root /etc/firewalld/zones/smtp2web.xml  
chmod 644 /etc/firewalld/zones/smtp2web.xml  
chown root:root /etc/logrotate.d/smtp2web  
chmod 644 /etc/logrotate.d/smtp2web  
chown root:smtp2web /etc/smtp2web  
chmod 750 /etc/smtp2web  
chown root:smtp2web /etc/smtp2web/config.json  
chmod 640 /etc/smtp2web/config.json  
chown root:smtp2web /etc/smtp2web/certs  
chmod 750 /etc/smtp2web/certs  
chown root:smtp2web /etc/smtp2web/certs/*.pem  
chmod 440 /etc/smtp2web/certs/private.pem  
chmod 640 /etc/smtp2web/certs/public.pem  
chmod 640 /etc/smtp2web/certs/rootca.pem  
chown root:root /etc/systemd/system/smtp2web.service  
chmod 644 /etc/systemd/system/smtp2web.service  
chown root:root zip-smtp2web-archives.service  
chmod 644 zip-smtp2web-archives.service  
chown root:root /etc/systemd/system/zip-smtp2web-archives.timer  
chmod 644 /etc/systemd/system/zip-smtp2web-archives.timer  
chown smtp2web:smtp2web /opt/smtp2web  
chmod 750 /opt/smtp2web  
chown smtp2web:smtp2web /opt/smtp2web/*  
chmod 640 /opt/smtp2web/*  
chown root:root /usr/local/scripts  
chmod 755 /usr/local/scripts  
chown smtp2web:smtp2web /usr/local/scripts/zip-smtp2web-archives.sh  
chmod 750 /usr/local/scripts/zip-smtp2web-archives.sh  
chown -R smtp2web:smtp2web /var/lib/smtp2web  
chmod 750 /var/lib/smtp2web  
chmod 750 /var/lib/smtp2web/archive  
chmod 750 /var/lib/smtp2web/spool  
chmod 750 /var/lib/smtp2web/spool/quarantine  
chown smtp2web:adm /var/log/smtp2web.log  
chmod 640 /var/log/smtp2web.log  

### 4.2 Review configuration
Edit the configuration file:
/etc/smtp2web/config.json

Pay special attention to:
- SMTP listen address and port
- TLS certificate paths
- Forwarder endpoint
- Archive settings

### 4.3 Install Node.js dependencies
From the code directory:
cd /opt/smtp2web
npm install --production

### 4.4 Firewall configuration (nftables example)
Allow SMTP submission on port 2525 (as defined in config.json) from
trusted hosts only. The following example is based on firewalld where
an xml file, like smtp2web.xml is created in /etc/firewalld/zones.

<?xml version="1.0" encoding="utf-8"?>
<zone target="DROP">
  <port port="2525" protocol="tcp"/>
  <forward-port port="25" protocol="tcp" to-port="2525"/>
  <source address="192.168.1.0/24"/>
</zone>

Adjust the source addresses as required.

### 4.5 Start the service (manual)
For testing purposes:
cd /opt/smtp2web
sudo -u smtp2web node server.js

Logs will be written to:
/var/log/smtp2web.log

---

## 5. Verification
### SMTP test
Use a tool like `swaks` to submit a test email.
Example:
swaks --to=user@company.internal --tls --server=smtp2web.company.internal

### Queue behavior
- Messages appear in `/var/lib/smtp2web/spool`
- Successfully delivered messages are archived
- Failed deliveries remain queued

### Logs
Inspect structured logs:
tail -f /var/log/smtp2web.log

---

## 6. Archiving and retention
Successfully delivered messages are archived by day under:
/var/lib/smtp2web/archive/YYYY-MM-DD/

Compression and retention are handled by a script that can be
executed via cron, a systemd timer or JS7 and is located here:
/opt/smtp2web/archive-mails.sh

---

## 7. Recovery & replay
Archived JSON files can be replayed manually by moving/copying them
to the spool directory.

---

## 8. Notes
- JSON is the canonical internal format
- XML is generated only at the forwarding edge (if enabled)
- The queue is the single source of truth
- Messages are only removed after they are successfully
  sent and archived

---

## 9. Update nodejs modules
To update the nodejs modules used by smtp2web, execute the following
commands, starting off as root:

su - smtp2web -s /bin/bash  
cd /opt/smtp2web  
npm update  
exit  

---

End of document.
