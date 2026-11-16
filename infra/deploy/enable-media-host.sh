#!/bin/sh
set -eu

cd "$(dirname "$0")/../.."
source_file=infra/deploy/gather.imtelak.com.nginx.conf
target=/etc/nginx/sites-available/gather.imtelak.com
backup_dir=/var/backups/gather-lite
backup="$backup_dir/gather.imtelak.com.nginx.$(date -u +%Y%m%dT%H%M%SZ).conf"

test -f "$target"
install -d -m 0700 "$backup_dir"
install -m 0600 "$target" "$backup"
install -m 0644 "$source_file" "$target"
if ! nginx -t; then
  install -m 0644 "$backup" "$target"
  nginx -t
  echo "Nginx validation failed; restored the previous Gather Lite site config." >&2
  exit 1
fi

ufw allow 17881/tcp
ufw allow 17882:17954/udp
systemctl reload nginx
echo "Gather Lite /rtc proxy installed; media transport firewall rules enabled."
