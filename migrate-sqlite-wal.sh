#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DB_PATH="${1:-"$ROOT_DIR/data/filemanager.db"}"
BACKUP_DIR="${2:-"$ROOT_DIR/data/backup-$(date +%Y%m%d-%H%M%S)"}"

if [[ ! -f "$DB_PATH" ]]; then
  echo "Database file not found: $DB_PATH" >&2
  exit 1
fi

if ! command -v sqlite3 >/dev/null 2>&1; then
  echo "sqlite3 is required but not installed." >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"

echo "Backing up database files to: $BACKUP_DIR"
cp -f "$DB_PATH" "$BACKUP_DIR/"
[[ -f "${DB_PATH}-wal" ]] && cp -f "${DB_PATH}-wal" "$BACKUP_DIR/"
[[ -f "${DB_PATH}-shm" ]] && cp -f "${DB_PATH}-shm" "$BACKUP_DIR/"

echo "Running WAL checkpoint on: $DB_PATH"
sqlite3 "$DB_PATH" "PRAGMA wal_checkpoint(FULL);"

echo "Checkpoint finished. Current database files:"
ls -lh "${DB_PATH}"*

echo "Done."
