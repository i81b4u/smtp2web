#!/bin/sh
set -eu

APP_USER="smtp2web"
APP_GROUP="smtp2web"
APP_HOME="/var/lib/smtp2web"
APP_SHELL="/usr/sbin/nologin"

SRC_ROOT=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd -P)

require_root() {
  if [ "$(id -u)" -ne 0 ]; then
    echo "error: this installer must be run as root" >&2
    exit 1
  fi
}

require_source() {
  if [ ! -e "${SRC_ROOT}/$1" ]; then
    echo "error: missing source path: $1" >&2
    exit 1
  fi
}

ensure_group() {
  if ! getent group "${APP_GROUP}" >/dev/null 2>&1; then
    groupadd --system "${APP_GROUP}"
  fi
}

ensure_user() {
  if ! id "${APP_USER}" >/dev/null 2>&1; then
    useradd \
      --system \
      --gid "${APP_GROUP}" \
      --home-dir "${APP_HOME}" \
      --shell "${APP_SHELL}" \
      "${APP_USER}"
  fi
}

install_file() {
  source_path=$1
  target_path=$2
  owner=$3
  group=$4
  mode=$5

  require_source "${source_path}"
  install -D -o "${owner}" -g "${group}" -m "${mode}" \
    "${SRC_ROOT}/${source_path}" "${target_path}"
}

install_optional_file() {
  source_path=$1
  target_path=$2
  owner=$3
  group=$4
  mode=$5

  if [ -e "${SRC_ROOT}/${source_path}" ]; then
    install -D -o "${owner}" -g "${group}" -m "${mode}" \
      "${SRC_ROOT}/${source_path}" "${target_path}"
  elif [ -e "${target_path}" ]; then
    chown "${owner}:${group}" "${target_path}"
    chmod "${mode}" "${target_path}"
  fi
}

# Configuration is operator-managed after the first installation. Install the
# packaged example only when no live configuration exists; later installer runs
# must not replace settings such as the forwarding endpoint or listener.
install_default_file() {
  source_path=$1
  target_path=$2
  owner=$3
  group=$4
  mode=$5

  require_source "${source_path}"

  if [ ! -e "${target_path}" ]; then
    install -D -o "${owner}" -g "${group}" -m "${mode}" \
      "${SRC_ROOT}/${source_path}" "${target_path}"
  else
    chown "${owner}:${group}" "${target_path}"
    chmod "${mode}" "${target_path}"
  fi
}

ensure_empty_file() {
  target_path=$1
  owner=$2
  group=$3
  mode=$4

  if [ ! -e "${target_path}" ]; then
    install -D -o "${owner}" -g "${group}" -m "${mode}" /dev/null "${target_path}"
  else
    chown "${owner}:${group}" "${target_path}"
    chmod "${mode}" "${target_path}"
  fi
}

ensure_dir() {
  target_path=$1
  owner=$2
  group=$3
  mode=$4

  install -d -o "${owner}" -g "${group}" -m "${mode}" "${target_path}"
}

require_root
ensure_group
ensure_user

ensure_dir /etc/smtp2web root "${APP_GROUP}" 750
ensure_dir /etc/smtp2web/certs root "${APP_GROUP}" 750
ensure_dir /opt/smtp2web "${APP_USER}" "${APP_GROUP}" 750
ensure_dir /opt/smtp2web/test "${APP_USER}" "${APP_GROUP}" 750
ensure_dir /opt/smtp2web/test/integration "${APP_USER}" "${APP_GROUP}" 750
ensure_dir /var/log/smtp2web "${APP_USER}" adm 750
ensure_empty_file /var/log/smtp2web/smtp2web.log "${APP_USER}" adm 640
ensure_dir /var/lib/smtp2web "${APP_USER}" "${APP_GROUP}" 750
ensure_dir /var/lib/smtp2web/archive "${APP_USER}" "${APP_GROUP}" 750
ensure_empty_file /var/lib/smtp2web/archive/.keep "${APP_USER}" "${APP_GROUP}" 640
ensure_dir /var/lib/smtp2web/debug "${APP_USER}" "${APP_GROUP}" 700
ensure_dir /var/lib/smtp2web/spool "${APP_USER}" "${APP_GROUP}" 750
ensure_dir /var/lib/smtp2web/spool/failed "${APP_USER}" "${APP_GROUP}" 750
ensure_empty_file /var/lib/smtp2web/spool/failed/.keep "${APP_USER}" "${APP_GROUP}" 640
ensure_dir /var/lib/smtp2web/spool/quarantine "${APP_USER}" "${APP_GROUP}" 750
ensure_empty_file /var/lib/smtp2web/spool/quarantine/.keep "${APP_USER}" "${APP_GROUP}" 640

install_default_file etc/smtp2web/config.json /etc/smtp2web/config.json root "${APP_GROUP}" 640
install_optional_file etc/smtp2web/certs/private.pem /etc/smtp2web/certs/private.pem root "${APP_GROUP}" 440
install_optional_file etc/smtp2web/certs/public.pem /etc/smtp2web/certs/public.pem root "${APP_GROUP}" 640
install_optional_file etc/smtp2web/certs/rootca.pem /etc/smtp2web/certs/rootca.pem root "${APP_GROUP}" 640

install_file opt/smtp2web/archive.js /opt/smtp2web/archive.js "${APP_USER}" "${APP_GROUP}" 640
install_file opt/smtp2web/certs.js /opt/smtp2web/certs.js "${APP_USER}" "${APP_GROUP}" 640
install_file opt/smtp2web/config.js /opt/smtp2web/config.js "${APP_USER}" "${APP_GROUP}" 640
install_file opt/smtp2web/debug.js /opt/smtp2web/debug.js "${APP_USER}" "${APP_GROUP}" 640
install_file opt/smtp2web/forwarder.js /opt/smtp2web/forwarder.js "${APP_USER}" "${APP_GROUP}" 640
install_file opt/smtp2web/INSTALL.md /opt/smtp2web/INSTALL.md "${APP_USER}" "${APP_GROUP}" 640
install_file opt/smtp2web/logger.js /opt/smtp2web/logger.js "${APP_USER}" "${APP_GROUP}" 640
install_file opt/smtp2web/mail.js /opt/smtp2web/mail.js "${APP_USER}" "${APP_GROUP}" 640
install_file opt/smtp2web/package.json /opt/smtp2web/package.json "${APP_USER}" "${APP_GROUP}" 640
install_file opt/smtp2web/package-lock.json /opt/smtp2web/package-lock.json "${APP_USER}" "${APP_GROUP}" 640
install_file opt/smtp2web/queue.js /opt/smtp2web/queue.js "${APP_USER}" "${APP_GROUP}" 640
install_file opt/smtp2web/README.md /opt/smtp2web/README.md "${APP_USER}" "${APP_GROUP}" 640
install_file opt/smtp2web/server.js /opt/smtp2web/server.js "${APP_USER}" "${APP_GROUP}" 640
install_file opt/smtp2web/test/validator-core.test.js /opt/smtp2web/test/validator-core.test.js "${APP_USER}" "${APP_GROUP}" 640
install_file opt/smtp2web/test/debug.test.js /opt/smtp2web/test/debug.test.js "${APP_USER}" "${APP_GROUP}" 640
install_file opt/smtp2web/test/archive.test.js /opt/smtp2web/test/archive.test.js "${APP_USER}" "${APP_GROUP}" 640
install_file opt/smtp2web/test/integration/fake_gateway.py /opt/smtp2web/test/integration/fake_gateway.py "${APP_USER}" "${APP_GROUP}" 640
install_file opt/smtp2web/test/integration/run.sh /opt/smtp2web/test/integration/run.sh "${APP_USER}" "${APP_GROUP}" 750
install_file opt/smtp2web/validator-core.js /opt/smtp2web/validator-core.js "${APP_USER}" "${APP_GROUP}" 640
install_file opt/smtp2web/validator.js /opt/smtp2web/validator.js "${APP_USER}" "${APP_GROUP}" 640

install_file etc/systemd/system/smtp2web.service /etc/systemd/system/smtp2web.service root root 644
install_file etc/systemd/system/zip-smtp2web-archives.service /etc/systemd/system/zip-smtp2web-archives.service root root 644
install_file etc/systemd/system/zip-smtp2web-archives.timer /etc/systemd/system/zip-smtp2web-archives.timer root root 644
install_file etc/logrotate.d/smtp2web /etc/logrotate.d/smtp2web root root 644
install_file usr/local/bin/zip-smtp2web-archives.sh /usr/local/bin/zip-smtp2web-archives.sh "${APP_USER}" "${APP_GROUP}" 750

echo "smtp2web files, directories, ownership, and permissions have been installed."
