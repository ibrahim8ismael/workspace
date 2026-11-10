#!/bin/sh
# PID 1: no forwarding starts until fresh policy, and expiry kills the local child.
set -eu
now_ms() { awk '{printf "%.0f", $1 * 1000}' /proc/uptime; }
boot=$(now_ms)
lease_valid() {
  now=$(now_ms)
  [ -f /lease/current ] || return 1
  read -r epoch installed < /lease/current || return 1
  case "$installed" in ''|*[!0-9]*) return 1;; esac
  [ "$epoch" = "$CP07_SFU_EPOCH" ] || return 1
  [ "$installed" -gt "$now" ] || return 1
  [ "$installed" -le $((now + 5000)) ] || return 1
  # A file from before this SFU boot is never an allow cache.
  [ $((installed - 5000)) -ge "$boot" ] || return 1
}
# Default-deny bootstrap: namespace may exist, but LiveKit is not running yet.
until lease_valid; do sleep 0.05; done
/livekit-server "$@" &
media=$!
trap 'kill -KILL "$media" 2>/dev/null || true' EXIT INT TERM
while kill -0 "$media" 2>/dev/null; do
  if ! lease_valid; then
    kill -KILL "$media" 2>/dev/null || true
    wait "$media" 2>/dev/null || true
    exit 70
  fi
  sleep 0.05
done
wait "$media"
