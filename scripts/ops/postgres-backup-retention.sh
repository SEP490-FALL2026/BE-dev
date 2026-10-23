#!/usr/bin/env bash
# DB-05 (delivery-gate-hardening): bounded retention for the pre-migration dumps written by the deploy workflow
# (.github/workflows/deploy.yml, step 3.5). Runbook: docs/guides/containers.md#backup-before-production-migrations.
#
# Keeps the 10 newest backups AND every backup younger than 30 days; only older backups beyond those 10 are deleted.
# Dry run unless --apply. Touches only regular files named slm-pre-migrate-<UTC yyyyMMddTHHmmssZ>-<sha>.dump directly in
# the given directory, which must be an absolute path ending in /backups/postgres. Age comes from the UTC stamp in the
# file name, not the file time. RETENTION_NOW=<yyyyMMddTHHmmssZ> fixes "now" (tests only).
#
# Exit: 0 done (or dry run), 1 a deletion failed, 2 usage error or refused target (nothing deleted).
set -euo pipefail

KEEP_NEWEST=10
KEEP_DAYS=30
NAME_PATTERN='^slm-pre-migrate-[0-9]{8}T[0-9]{6}Z-[0-9a-f]{7,40}\.dump$'

usage() {
  echo 'usage: postgres-backup-retention.sh --dir <APP_DIR>/backups/postgres [--apply]' >&2
  exit 2
}
refuse() {
  echo "refused: $1" >&2
  exit 2
}

DIR=''
APPLY=0
while [ "$#" -gt 0 ]; do
  case "$1" in
    --dir)
      [ "$#" -ge 2 ] || usage
      DIR="$2"
      shift 2
      ;;
    --apply)
      APPLY=1
      shift
      ;;
    -h | --help)
      sed -n '2,10p' "$0" 2>/dev/null || true
      exit 0
      ;;
    *)
      echo "unknown option: $1" >&2
      usage
      ;;
  esac
done

[ -n "$DIR" ] || usage
case "$DIR" in
  /*) ;;
  *) refuse '--dir must be an absolute path' ;;
esac
DIR="${DIR%/}"
case "$DIR" in
  */backups/postgres) ;;
  *) refuse "$DIR is not an application backup directory (<APP_DIR>/backups/postgres)" ;;
esac
if [ ! -d "$DIR" ] || [ -L "$DIR" ]; then refuse "$DIR is not a directory"; fi

stamp_epoch() {
  local s="$1"
  date -u -d "${s:0:4}-${s:4:2}-${s:6:2} ${s:9:2}:${s:11:2}:${s:13:2}" +%s 2>/dev/null
}

if [ -n "${RETENTION_NOW:-}" ]; then
  [[ "$RETENTION_NOW" =~ ^[0-9]{8}T[0-9]{6}Z$ ]] || refuse 'RETENTION_NOW must be yyyyMMddTHHmmssZ'
  NOW_EPOCH="$(stamp_epoch "${RETENTION_NOW}")" || refuse 'RETENTION_NOW is not a valid time'
else
  NOW_EPOCH="$(date -u +%s)"
fi
CUTOFF=$((NOW_EPOCH - KEEP_DAYS * 86400))

# Classify everything before deleting anything.
backups=()
while IFS= read -r name; do
  [ -n "$name" ] || continue
  path="$DIR/$name"
  if [[ ! "$name" =~ $NAME_PATTERN ]] || [ ! -f "$path" ] || [ -L "$path" ]; then
    echo "ignored $name"
    continue
  fi
  if ! stamp_epoch "${name:16:16}" >/dev/null; then
    echo "ignored $name (invalid time stamp)"
    continue
  fi
  backups+=("$name")
done < <(ls -A1 -- "$DIR")

# Names share one prefix, so sorting by name in reverse is newest first.
sorted=()
if [ "${#backups[@]}" -gt 0 ]; then
  while IFS= read -r name; do sorted+=("$name"); done < <(printf '%s\n' "${backups[@]}" | LC_ALL=C sort -r)
fi

expired=()
index=0
for name in "${sorted[@]+"${sorted[@]}"}"; do
  epoch="$(stamp_epoch "${name:16:16}")"
  if [ "$index" -lt "$KEEP_NEWEST" ]; then
    echo "keep $name (one of the $KEEP_NEWEST newest)"
  elif [ "$epoch" -gt "$CUTOFF" ]; then
    echo "keep $name (younger than $KEEP_DAYS days)"
  else
    expired+=("$name")
  fi
  index=$((index + 1))
done

total="${#sorted[@]}"
if [ "$APPLY" -ne 1 ]; then
  for name in "${expired[@]+"${expired[@]}"}"; do echo "would delete $name"; done
  echo "DRY RUN: would delete ${#expired[@]} of $total backups in $DIR; run again with --apply to delete them."
  exit 0
fi

deleted=0
for name in "${expired[@]+"${expired[@]}"}"; do
  path="$DIR/$name"
  # Checked again right before deleting: still a regular file with the exact name.
  if [[ "$name" =~ $NAME_PATTERN ]] && [ -f "$path" ] && [ ! -L "$path" ]; then
    rm -f -- "$path"
    echo "deleted $name"
    deleted=$((deleted + 1))
  fi
done
echo "deleted $deleted of $total backups in $DIR"
[ "$deleted" -eq "${#expired[@]}" ] || exit 1
