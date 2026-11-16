#!/usr/bin/env bash
set -euo pipefail

repo_root="$(git -C "$(dirname "$0")/../.." rev-parse --show-toplevel)"
backup_dir="${GATHER_BACKUP_DIR:-/var/backups/gather-lite}"
env_file="$repo_root/infra/deploy/.env"
compose_file="$repo_root/infra/deploy/compose.yaml"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
archive="$backup_dir/gather-lite-$stamp.archive.gz"
temporary="$archive.partial"

install -d -m 0700 "$backup_dir"
umask 077
docker compose --env-file "$env_file" -f "$compose_file" exec -T mongo \
  mongodump --db gather_lite --archive --gzip > "$temporary"
gzip -t "$temporary"
mv "$temporary" "$archive"
chmod 0600 "$archive"
printf 'Verified MongoDB archive: %s\n' "$archive"
