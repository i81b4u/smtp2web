#!/usr/bin/env bash
set -euo pipefail

###############################################################################
# Configuration
###############################################################################

EXPECTED_USER="smtp2web"
KEEPTIME=7
ARCHIVEDIR="/var/lib/smtp2web/archive"
ZIPBASENAME="mail-archive"
LOGFILE="/var/log/smtp2web.log"
LOCKFILE="/run/lock/smtp2web-archive.lock"

###############################################################################
# Safety checks
###############################################################################

# Ensure correct user (defense in depth)
if [ "$(id -un)" != "$EXPECTED_USER" ]; then
  echo "This script must be run as user $EXPECTED_USER" >&2
  exit 1
fi

# Ensure archive directory exists
if [ ! -d "$ARCHIVEDIR" ]; then
  echo "Archive directory does not exist: $ARCHIVEDIR" >&2
  exit 1
fi

###############################################################################
# Logging setup
###############################################################################

exec >>"$LOGFILE" 2>&1

log() {
  echo "{\"ts\":\"$(date -u +"%Y-%m-%dT%H:%M:%S.%3NZ")\",\"level\":\"INFO\",\"component\":\"cleanup\",\"message\":\"$1\"}"
}

###############################################################################
# Locking (prevent overlapping runs)
###############################################################################

exec 9>"$LOCKFILE"
if ! flock -n 9; then
  log "another instance is already running, exiting"
  exit 0
fi

###############################################################################
# Start
###############################################################################

log "cleanup script started"

###############################################################################
# Cleanup old directories
###############################################################################

find "$ARCHIVEDIR" -mindepth 1 -maxdepth 1 -type d -mtime +"$KEEPTIME" -exec rm -rf {} +;

###############################################################################
# Find directories containing JSON files
###############################################################################

readarray -t DIRSTOARCHIVE < <(
  find "$ARCHIVEDIR" -type f -name "*.json" \
  | xargs -r dirname \
  | sort -u
)

if [ "${#DIRSTOARCHIVE[@]}" -eq 0 ]; then
  log "nothing to archive"
else
  for dir in "${DIRSTOARCHIVE[@]}"; do
    DIRNAME=$(basename "$dir")
    ZIPNAME="${ZIPBASENAME}_${DIRNAME}.zip"

    json_files=("$dir"/*.json)
    if [ "${#json_files[@]}" -eq 0 ]; then
      continue
    fi

    # Create or update archive
    zip -9jq "$dir/$ZIPNAME" "${json_files[@]}"

    # Remove JSON files after successful archiving
    rm "${json_files[@]}"
  done

  log "files archived"
fi

###############################################################################
# End
###############################################################################

log "cleanup script finished"
