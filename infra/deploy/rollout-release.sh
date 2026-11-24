#!/usr/bin/env bash
set -Eeuo pipefail

manifest_file="${1:?usage: rollout-release.sh <release-images.env> <commit-sha> <registry-user>}"
release_sha="${2:?usage: rollout-release.sh <release-images.env> <commit-sha> <registry-user>}"
registry_user="${3:?usage: rollout-release.sh <release-images.env> <commit-sha> <registry-user>}"
deploy_env="${GATHER_DEPLOY_ENV_FILE:-/tmp/gather-main-deploy/infra/deploy/.env}"
project="${GATHER_COMPOSE_PROJECT:-gather-lite-pilot}"

[[ "$release_sha" =~ ^[0-9a-f]{40}$ ]] || { echo 'Invalid release commit SHA.' >&2; exit 2; }
[[ "$registry_user" =~ ^[A-Za-z0-9_.-]+$ ]] || { echo 'Invalid registry user.' >&2; exit 2; }
[[ -f "$manifest_file" && -r "$manifest_file" ]] || { echo 'Release manifest is missing or unreadable.' >&2; exit 2; }
[[ -f "$deploy_env" && ! -L "$deploy_env" && -r "$deploy_env" && -w "$deploy_env" ]] || {
  echo 'Protected deployment .env is missing, linked, or inaccessible.' >&2
  exit 2
}

env_mode="$(stat -c '%a' "$deploy_env")"
if (( (8#$env_mode & 077) != 0 )); then
  echo 'Protected deployment .env must not be readable or writable by group/other.' >&2
  exit 2
fi

python3 - "$manifest_file" <<'PY'
import re
import sys

path = sys.argv[1]
patterns = {
    "GATHER_API_IMAGE": r"ghcr\.io/ibrahim8ismael/gather-lite-api@sha256:[0-9a-f]{64}",
    "GATHER_WORKER_IMAGE": r"ghcr\.io/ibrahim8ismael/gather-lite-worker@sha256:[0-9a-f]{64}",
    "GATHER_MEDIA_GUARD_IMAGE": r"ghcr\.io/ibrahim8ismael/gather-lite-media-guard@sha256:[0-9a-f]{64}",
    "GATHER_WEB_IMAGE": r"ghcr\.io/ibrahim8ismael/gather-lite-web@sha256:[0-9a-f]{64}",
    "GATHER_WEB_CORE_IMAGE": r"ghcr\.io/ibrahim8ismael/gather-lite-web-core@sha256:[0-9a-f]{64}",
}
values = {}
with open(path, encoding="utf-8") as stream:
    for raw in stream:
        line = raw.rstrip("\r\n")
        if not line or line.lstrip().startswith("#"):
            continue
        key, separator, value = line.partition("=")
        if not separator or key not in patterns or key in values:
            raise SystemExit("Release manifest has an unexpected or duplicate entry.")
        if re.fullmatch(patterns[key], value) is None:
            raise SystemExit("Release manifest contains an invalid image reference.")
        values[key] = value

required = set(patterns)
if set(values) != required:
    raise SystemExit("Release manifest does not contain the expected image set.")
PY

api_container="$(docker ps -aq --filter "label=com.docker.compose.project=$project" --filter 'label=com.docker.compose.service=api' | head -n 1)"
[[ -n "$api_container" ]] || { echo 'Could not find the production API Compose container.' >&2; exit 2; }

config_files="$(docker inspect --format '{{ index .Config.Labels "com.docker.compose.project.config_files" }}' "$api_container")"
working_dir="$(docker inspect --format '{{ index .Config.Labels "com.docker.compose.project.working_dir" }}' "$api_container")"
[[ -n "$config_files" && "$config_files" != '<no value>' ]] || {
  echo 'The production API has no Compose configuration labels; refusing an untracked rollout.' >&2
  exit 2
}

IFS=',' read -r -a compose_files <<< "$config_files"
for compose_file in "${compose_files[@]}"; do
  compose_file="${compose_file# }"
  [[ -f "$compose_file" ]] || { echo 'A Compose file from the active production project is missing.' >&2; exit 2; }
done
if [[ -z "$working_dir" || "$working_dir" == '<no value>' || ! -d "$working_dir" ]]; then
  working_dir="$(dirname "${compose_files[0]}")"
fi
pushd "$working_dir" >/dev/null

compose_args=(compose -p "$project" --env-file "$deploy_env" --profile media-pilot --profile mailpit --profile mail)
for compose_file in "${compose_files[@]}"; do
  compose_file="${compose_file# }"
  compose_args+=(-f "$compose_file")
done
compose() { docker "${compose_args[@]}" "$@"; }

require_service_container() {
  local service="$1"
  local id
  id="$(docker ps -aq --filter "label=com.docker.compose.project=$project" --filter "label=com.docker.compose.service=$service" | head -n 1)"
  [[ -n "$id" ]] || { echo "Production Compose service '$service' is absent; refusing rollout." >&2; return 1; }
}

require_service_container api
require_service_container caddy
require_service_container media-guard

worker_running=()
worker_existing=()
for service in worker worker-mailpit; do
  if [[ -n "$(docker ps -q --filter "label=com.docker.compose.project=$project" --filter "label=com.docker.compose.service=$service" | head -n 1)" ]]; then
    worker_running+=("$service")
  fi
  if [[ -n "$(docker ps -aq --filter "label=com.docker.compose.project=$project" --filter "label=com.docker.compose.service=$service" | head -n 1)" ]]; then
    worker_existing+=("$service")
  fi
done
if (( ${#worker_running[@]} > 1 )); then
  echo 'Both production mail workers are running; refusing to change queue consumers.' >&2
  exit 2
elif (( ${#worker_running[@]} == 1 )); then
  worker_service="${worker_running[0]}"
elif (( ${#worker_existing[@]} == 1 )); then
  worker_service="${worker_existing[0]}"
else
  echo 'Could not determine the active production mail worker; refusing to start a second queue consumer.' >&2
  exit 2
fi
deploy_services=(api caddy media-guard "$worker_service")

app_domain="$(python3 - "$deploy_env" <<'PY'
import re
import sys

value = None
with open(sys.argv[1], encoding="utf-8") as stream:
    for line in stream:
        if line.startswith("APP_DOMAIN="):
            value = line.partition("=")[2].strip()
            break
if value is None or re.fullmatch(r"[A-Za-z0-9.-]+", value) is None:
    raise SystemExit("APP_DOMAIN is not configured as a hostname.")
print(value)
PY
)"

IFS= read -r registry_token || [[ -n "${registry_token:-}" ]]
[[ -n "${registry_token:-}" ]] || { echo 'Temporary registry credential was not provided.' >&2; exit 2; }
docker_config="$(mktemp -d /tmp/gather-ghcr-auth.XXXXXX)"
chmod 0700 "$docker_config"
export DOCKER_CONFIG="$docker_config"
promotion_applied=false
deployment_verified=false
rollback_attempted=false
cleanup() {
  local status="$?"
  if [[ "$promotion_applied" == true && "$deployment_verified" != true && "$rollback_attempted" != true ]]; then
    rollback || true
  fi
  unset registry_token
  rm -rf -- "$docker_config"
  return "$status"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
if ! printf '%s' "$registry_token" | docker login ghcr.io --username "$registry_user" --password-stdin; then
  unset registry_token
  echo 'Temporary GHCR authentication failed; production was not changed.' >&2
  exit 1
fi
unset registry_token

backup_dir="${GATHER_BACKUP_DIR:-/var/backups/gather-lite}"
install -d -m 0700 "$backup_dir"
umask 077
backup_stamp="$(date -u +%Y%m%dT%H%M%SZ)"
database_backup="$backup_dir/gather-lite-${backup_stamp}-${release_sha:0:12}.archive.gz"
temporary_backup="$database_backup.partial"
if ! compose exec -T mongo mongodump --db gather_lite --archive --gzip > "$temporary_backup"; then
  rm -f -- "$temporary_backup"
  echo 'MongoDB pre-deploy backup failed; production was not changed.' >&2
  exit 1
fi
if ! gzip -t "$temporary_backup"; then
  rm -f -- "$temporary_backup"
  echo 'MongoDB backup validation failed; production was not changed.' >&2
  exit 1
fi
mv -- "$temporary_backup" "$database_backup"
chmod 0600 "$database_backup"

env_backup="${deploy_env}.pre-${release_sha:0:12}-${backup_stamp}"
cp -p -- "$deploy_env" "$env_backup"
chmod 0600 "$env_backup"

python3 - "$manifest_file" "$deploy_env" <<'PY'
import os
import re
import stat
import sys
import tempfile

manifest_path, env_path = sys.argv[1:]
keys = {
    "GATHER_API_IMAGE",
    "GATHER_WORKER_IMAGE",
    "GATHER_MEDIA_GUARD_IMAGE",
    "GATHER_WEB_IMAGE",
}
updates = {}
with open(manifest_path, encoding="utf-8") as stream:
    for raw in stream:
        line = raw.rstrip("\r\n")
        if not line or line.lstrip().startswith("#"):
            continue
        key, _, value = line.partition("=")
        if key in keys:
            if key in updates:
                raise SystemExit("Duplicate image key in release manifest.")
            updates[key] = value
if set(updates) != keys:
    raise SystemExit("Release manifest is missing a production image reference.")

mode = stat.S_IMODE(os.stat(env_path, follow_symlinks=False).st_mode)
with open(env_path, encoding="utf-8", newline="") as stream:
    lines = stream.readlines()
counts = {key: 0 for key in keys}
updated = []
for line in lines:
    body = line.rstrip("\r\n")
    ending = line[len(body):]
    key, separator, _ = body.partition("=")
    if separator and key in keys:
        counts[key] += 1
        if counts[key] > 1:
            raise SystemExit("Duplicate production image key in protected .env.")
        updated.append(f"{key}={updates[key]}{ending}")
    else:
        updated.append(line)
for key in sorted(keys):
    if counts[key] == 0:
        if updated and not updated[-1].endswith(("\n", "\r")):
            updated[-1] += "\n"
        updated.append(f"{key}={updates[key]}\n")

directory = os.path.dirname(env_path)
fd, temporary = tempfile.mkstemp(prefix=".gather-env-", dir=directory, text=True)
try:
    with os.fdopen(fd, "w", encoding="utf-8", newline="") as stream:
        stream.writelines(updated)
        stream.flush()
        os.fsync(stream.fileno())
    os.chmod(temporary, mode)
    os.replace(temporary, env_path)
finally:
    if os.path.exists(temporary):
        os.unlink(temporary)
PY
promotion_applied=true

wait_healthy() {
  local service="$1"
  local attempts="${2:-60}"
  local id status
  for ((attempt = 0; attempt < attempts; attempt++)); do
    id="$(compose ps -q "$service" 2>/dev/null | head -n 1 || true)"
    if [[ -n "$id" ]]; then
      status="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}no-healthcheck{{end}}' "$id" 2>/dev/null || true)"
      [[ "$status" == healthy ]] && return 0
      [[ "$status" == unhealthy ]] && return 1
    fi
    sleep 5
  done
  return 1
}

rollback() {
  rollback_attempted=true
  echo 'Deployment verification failed; restoring previous image references and restarting the same services.' >&2
  cp -p -- "$env_backup" "$deploy_env"
  if compose up -d --no-build --pull never "${deploy_services[@]}" \
    && wait_healthy api 60 \
    && compose restart media-guard \
    && wait_healthy media-guard 60 \
    && wait_healthy caddy 60; then
    echo 'Application rollback completed; persistent database and queue data were retained.' >&2
  else
    echo 'Automatic application rollback did not pass health checks; inspect the recorded previous image references and service logs.' >&2
  fi
}

if ! compose pull "${deploy_services[@]}"; then
  rollback
  exit 1
fi
if ! compose up -d --no-build --pull never "${deploy_services[@]}"; then
  rollback
  exit 1
fi
if ! wait_healthy api 60 || ! compose restart media-guard || ! wait_healthy media-guard 60 \
  || ! wait_healthy caddy 60; then
  rollback
  exit 1
fi

public_ok=false
for attempt in {1..6}; do
  if curl --fail --silent --show-error --max-time 15 "https://${app_domain}/api/health/live" >/dev/null; then
    public_ok=true
    break
  fi
  sleep 5
done
if [[ "$public_ok" != true ]]; then
  rollback
  exit 1
fi
deployment_verified=true

state_dir="${HOME}/.local/state/gather-lite"
if install -d -m 0700 "$state_dir" \
  && printf '%s\n' "$release_sha" > "$state_dir/last-successful-sha.tmp" \
  && chmod 0600 "$state_dir/last-successful-sha.tmp" \
  && mv -- "$state_dir/last-successful-sha.tmp" "$state_dir/last-successful-sha"; then
  :
else
  echo 'Warning: deployment succeeded but the local release marker could not be saved.' >&2
fi
echo "Production rollout verified for ${release_sha}; MongoDB backup: ${database_backup}"
