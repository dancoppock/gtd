#!/usr/bin/env bash
set -Eeuo pipefail

DATABASE_PATH="${GTD_DATABASE_PATH:-/opt/docker/gtd/api/data/gtd.sqlite}"
BACKUP_DIR="${GTD_BACKUP_DIR:-/opt/docker/gtd/backups}"
RETENTION_DAYS="${GTD_BACKUP_RETENTION_DAYS:-30}"
LOCK_DIR="${GTD_BACKUP_LOCK_DIR:-/tmp/gtd-sqlite-backup.lock}"

log() {
  printf '[%s] %s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "$*"
}

fail() {
  log "ERROR: $*"
  exit 1
}

command -v sqlite3 >/dev/null 2>&1 || fail "sqlite3 is not installed. On Ubuntu, run: sudo apt-get install sqlite3"
command -v gzip >/dev/null 2>&1 || fail "gzip is not installed"

[[ -f "${DATABASE_PATH}" ]] || fail "database not found at ${DATABASE_PATH}"
[[ "${RETENTION_DAYS}" =~ ^[0-9]+$ ]] || fail "GTD_BACKUP_RETENTION_DAYS must be a non-negative integer"

mkdir -p "${BACKUP_DIR}"

if ! mkdir "${LOCK_DIR}" 2>/dev/null; then
  fail "another backup is already running"
fi

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
backup_base="${BACKUP_DIR}/gtd-${timestamp}.sqlite"
tmp_backup="${backup_base}.tmp"
final_backup="${backup_base}.gz"

cleanup() {
  rm -f "${tmp_backup}"
  rmdir "${LOCK_DIR}" 2>/dev/null || true
}
trap cleanup EXIT

log "creating online SQLite backup from ${DATABASE_PATH}"
sqlite3 "${DATABASE_PATH}" ".backup '${tmp_backup}'"

log "verifying backup integrity"
integrity_result="$(sqlite3 "${tmp_backup}" "PRAGMA integrity_check;")"
[[ "${integrity_result}" == "ok" ]] || fail "integrity_check failed: ${integrity_result}"

gzip -9 "${tmp_backup}"
mv "${tmp_backup}.gz" "${final_backup}"

log "backup written to ${final_backup}"

if (( RETENTION_DAYS > 0 )); then
  log "removing backups older than ${RETENTION_DAYS} days from ${BACKUP_DIR}"
  find "${BACKUP_DIR}" -maxdepth 1 -type f -name 'gtd-*.sqlite.gz' -mtime "+${RETENTION_DAYS}" -delete
fi
