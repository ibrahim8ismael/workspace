#!/bin/sh
# Runs as PID 1 in the fixture SFU. No Docker API or network control is used.
set -eu
now_ms() { awk '{printf "%.0f", $1 * 1000}' /proc/uptime; }
boot=$(now_ms)
/livekit-server "$@" &
media=$!
trap 'kill -KILL "$media" 2>/dev/null || true' EXIT INT TERM
while kill -0 "$media" 2>/dev/null; do
  now=$(now_ms)
  deadline=$((boot + 3000))
  if [ -f /lease/current ]; then
    read -r epoch installed < /lease/current || installed=0
    case "$installed" in ''|*[!0-9]*) installed=0;; esac
    if [ "${epoch:-}" != "$CP07_SFU_EPOCH" ]; then installed=0; fi
    # Never accept more than five seconds into the future, even from a bad file.
    if [ "$installed" -gt $((now + 5000)) ]; then installed=0; fi
    if [ "$installed" -le "$boot" ]; then
      deadline=$((boot + 3000))
    else
      deadline=$installed
    fi
  fi
  if [ "$now" -ge "$deadline" ]; then
    kill -KILL "$media" 2>/dev/null || true
    wait "$media" 2>/dev/null || true
    exit 70
  fi
  sleep 0.05
done
wait "$media"
