#!/usr/bin/env bash
# Owner-run demo reset/seed. Never invoked by CD. Secrets are parsed as data and piped only to seed stdin.
set +x
set -euo pipefail
umask 077
for inherited in "${!SEED_@}"; do unset "$inherited"; done

refuse() { printf 'refused: %s\n' "$*" >&2; exit 3; }
fail() { printf 'failed after %s: %s\n' "$PHASE" "$*" >&2; exit 1; }
APP_DIR='' CONFIG='' CONFIRM='' CONTINUE=0 READY_TIMEOUT=180 PHASE=validation
while [ "$#" -gt 0 ]; do
  case "$1" in
    --app-dir) [ "$#" -ge 2 ] || refuse 'missing app-dir'; APP_DIR="$2"; shift 2 ;;
    --config) [ "$#" -ge 2 ] || refuse 'missing config'; CONFIG="$2"; shift 2 ;;
    --confirm-reset) [ "$#" -ge 2 ] || refuse 'missing database confirmation'; CONFIRM="$2"; shift 2 ;;
    --continue) CONTINUE=1; shift ;;
    --ready-timeout) [ "$#" -ge 2 ] || refuse 'missing ready timeout'; READY_TIMEOUT="$2"; shift 2 ;;
    --help) printf '%s\n' 'seed.sh --app-dir <absolute dir> --config <private file> [--confirm-reset <database>] [--continue] [--ready-timeout <seconds>]'; exit 0 ;;
    *) refuse 'unknown option' ;;
  esac
done
[[ "$APP_DIR" = /* && "$CONFIG" = /* ]] || refuse 'app-dir and config must be absolute'
[[ "$READY_TIMEOUT" =~ ^[1-9][0-9]*$ ]] || refuse 'ready timeout must be positive seconds'
[ -z "$CONFIRM" ] || [ "$CONTINUE" -eq 0 ] || refuse 'choose reset or continue'
[ -d "$APP_DIR/releases" ] && [ -f "$APP_DIR/docker-compose.prod.yml" ] || refuse 'application layout missing'
[ -f "$CONFIG" ] && [ ! -L "$CONFIG" ] || refuse 'private configuration missing or symlinked'
[ "$(stat -c %a "$CONFIG")" = 600 ] && [ "$(stat -c %u "$CONFIG")" = "$(id -u)" ] || refuse 'private config must be owner-only mode 600'
command -v flock >/dev/null || refuse 'flock is required'
exec 9>"$APP_DIR/releases/.deploy.lock"
flock -n 9 || refuse 'deployment or seed already holds the deploy lock'

SEED_ALLOW_RESET=false
PORT=3000 POSTGRES_DB=software_license_management
read_settings() {
  local file="$1" scope="$2" line key value seen='|'
  [ -f "$file" ] || refuse 'configuration file missing'
  while IFS= read -r line || [ -n "$line" ]; do
    line="${line%$'\r'}"
    [[ "$line" =~ ^[[:space:]]*(#|$) ]] && continue
    [[ "$line" =~ ^([A-Z][A-Z0-9_]*)=(.*)$ ]] || refuse 'invalid configuration assignment'
    key="${BASH_REMATCH[1]}" value="${BASH_REMATCH[2]}"
    if [[ "$value" = \"*\" || "$value" = \'*\' ]]; then value="${value:1:${#value}-2}"; fi
    if [ "$scope" = seed ]; then
      case "$key" in SEED_OPERATOR_REFERENCE|SEED_SUPER_ADMIN_PASSWORD|SEED_DEMO_ACCOUNT_PASSWORD|SEED_ALLOW_RESET) ;; *) refuse 'unknown seed configuration key' ;; esac
    else
      case "$key" in PORT|POSTGRES_DB) ;; *) continue ;; esac
    fi
    [[ "$seen" != *"|$key|"* ]] || refuse 'duplicate configuration key'
    seen="$seen$key|"
    printf -v "$key" '%s' "$value"
  done < "$file"
}
read_settings "$CONFIG" seed
read_settings "$APP_DIR/.env" app
[ -n "${SEED_OPERATOR_REFERENCE:-}" ] && [ -n "${SEED_SUPER_ADMIN_PASSWORD:-}" ] && [ -n "${SEED_DEMO_ACCOUNT_PASSWORD:-}" ] || refuse 'operator and both seed passwords are required'
[[ "$SEED_ALLOW_RESET" = true || "$SEED_ALLOW_RESET" = false ]] || refuse 'SEED_ALLOW_RESET must be true or false'
[[ "$PORT" =~ ^[0-9]+$ ]] && [ "$PORT" -ge 1 ] && [ "$PORT" -le 65535 ] || refuse 'invalid PORT'
[[ "$POSTGRES_DB" =~ ^[A-Za-z_][A-Za-z0-9_-]*$ ]] || refuse 'database name is not a supported identifier'
IMAGE="$(cat "$APP_DIR/releases/current-image")"
[[ "$IMAGE" =~ ^[a-zA-Z0-9][a-zA-Z0-9./_-]*(:[0-9a-f]{40}|@sha256:[0-9a-f]{64})$ ]] || refuse 'deployed image must be immutable'
compose() { API_IMAGE="$IMAGE" docker compose --project-directory "$APP_DIR" -f "$APP_DIR/docker-compose.prod.yml" "$@"; }
secrets() { printf 'SUPER_ADMIN_PASSWORD=%s\nDEMO_ACCOUNT_PASSWORD=%s\n' "$SEED_SUPER_ADMIN_PASSWORD" "$SEED_DEMO_ACCOUNT_PASSWORD"; }
seed_call() { secrets | compose run --rm --no-deps -T api node dist/cli.js seed "$@" --environment SHARED --secrets-stdin; }
HELP="$(compose run --rm --no-deps -T api node dist/cli.js seed --help)" || refuse 'cannot read seed protocol'
printf '%s\n' "$HELP" | grep -qx 'SEED_PROTOCOL 1' || refuse 'image does not support SEED_PROTOCOL 1'
set +e
CHECK="$(seed_call check)"
CHECK_CODE=$?
set -e
field() { printf '%s\n' "$CHECK" | awk -F '\t' -v key="$1" '$1 == key { sub(/^[^\t]*\t/, ""); print; exit }'; }
STATE="$(field STATE)"
if [ "$CHECK_CODE" -eq 3 ] && [ "$STATE" != NOT_MIGRATED ]; then refuse 'seed secrets or state refused before any change'; fi
DO_RESET=0
case "$CHECK_CODE:$STATE" in
  0:EMPTY) ;;
  3:NOT_MIGRATED)
    compose run --rm --no-deps -T migrate node node_modules/prisma/build/index.js migrate deploy || fail 'migration failed'
    PHASE=migrated ;;
  2:INSTALLED|2:INCOMPLETE|1:*)
    printf 'Database %s; organization %s; environment %s; %s\n' "$POSTGRES_DB" "$(field ORGANIZATION)" "$(field ENVIRONMENT)" "$(field COUNTS)"
    CHOICE="$CONFIRM"
    if [ "$CONTINUE" -eq 1 ]; then CHOICE=c
    elif [ -z "$CONFIRM" ]; then printf 'Type database name to reset, c to continue, or Enter to exit: '; IFS= read -r CHOICE || CHOICE=''; fi
    [ -n "$CHOICE" ] || exit 0
    if [ "$CHOICE" = c ]; then
      [ "$CHECK_CODE" -eq 2 ] && [ "$STATE" = INSTALLED ] && [ "$(field FIXTURE_ORGANIZATION)" = yes ] || refuse 'continuation requires a complete fixture organization'
    else
      [ "$CHOICE" = "$POSTGRES_DB" ] || refuse 'database confirmation does not match'
      [ "$SEED_ALLOW_RESET" = true ] || refuse 'reset requires SEED_ALLOW_RESET=true'
      DO_RESET=1
    fi ;;
  *) fail 'unexpected seed check result' ;;
esac

DROP_STARTED=0 DUMP=''
cleanup() {
  local code=$?
  if [ "$DROP_STARTED" -eq 1 ] && [ "$code" -eq 1 ]; then
    compose stop api worker >/dev/null 2>&1 || true
    printf 'Stopped api/worker. Completed phase: %s. Restore dump %s: recreate database, run db-admin, pg_restore as deploy role, reconcile, then up -d api worker.\n' "$PHASE" "$DUMP" >&2
    printf 'Recovery commands (use the same immutable API_IMAGE and Compose project):\n' >&2
    printf 'export API_IMAGE=%q\n' "$IMAGE" >&2
    printf 'docker compose --project-directory %q -f %q exec -T postgres sh -c '\''psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d postgres -c "DROP DATABASE \\"$POSTGRES_DB\\" WITH (FORCE)" -c "CREATE DATABASE \\"$POSTGRES_DB\\""'\''\n' "$APP_DIR" "$APP_DIR/docker-compose.prod.yml" >&2
    printf 'docker compose --project-directory %q -f %q run --rm -T db-admin\n' "$APP_DIR" "$APP_DIR/docker-compose.prod.yml" >&2
    printf 'docker compose --project-directory %q -f %q run --rm --no-deps -T backup sh -c '\''pg_restore --exit-on-error --no-owner --no-privileges --dbname "$PGDATABASE"'\'' < %q\n' "$APP_DIR" "$APP_DIR/docker-compose.prod.yml" "$DUMP" >&2
    printf 'Then run migrate node dist/database-roles-cli.js reconcile and up -d api worker.\n' >&2
  fi
}
trap cleanup EXIT
if [ "$DO_RESET" -eq 1 ]; then
  mkdir -p "$APP_DIR/backups/postgres"
  DUMP="$APP_DIR/backups/postgres/slm-pre-reseed-$(date -u +%Y%m%dT%H%M%SZ).dump"
  [ ! -e "$DUMP" ] && [ ! -e "$DUMP.partial" ] || fail 'backup name already exists'
  compose run --rm --no-deps -T backup pg_dump --format=custom --no-owner --no-privileges > "$DUMP.partial" || fail 'dump failed; database untouched'
  [ -s "$DUMP.partial" ] || fail 'dump empty; database untouched'
  compose run --rm --no-deps -T backup pg_restore --list < "$DUMP.partial" >/dev/null || fail 'dump verification failed; database untouched'
  mv -- "$DUMP.partial" "$DUMP"
  PHASE=dump-verified
  compose stop api worker || fail 'stop failed; database untouched'
  PHASE=services-stopped
  DROP_STARTED=1
  compose exec -T postgres sh -c 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d postgres -c "DROP DATABASE \"$POSTGRES_DB\" WITH (FORCE)" -c "CREATE DATABASE \"$POSTGRES_DB\""' || fail 'database recreation failed'
  PHASE=database-recreated
  compose run --rm -T db-admin || fail 'provision failed'
  PHASE=provisioned
  compose run --rm --no-deps -T migrate node node_modules/prisma/build/index.js migrate deploy || fail 'migration failed'
  PHASE=migrated
  compose run --rm --no-deps -T migrate node dist/database-roles-cli.js reconcile || fail 'reconcile failed'
  PHASE=reconciled
  compose up -d api worker || fail 'startup failed'
  PHASE=services-started
  READY_PROBE='fetch("http://127.0.0.1:"+(process.env.PORT||3000)+"/"+(process.env.API_PREFIX||"api")+"/v1/health/ready",{signal:AbortSignal.timeout(10000)}).then(r=>process.exit(r.ok?0:1),()=>process.exit(1))'
  DEADLINE=$((SECONDS + READY_TIMEOUT))
  until compose exec -T api node -e "$READY_PROBE"; do
    [ "$SECONDS" -lt "$DEADLINE" ] || fail 'API ready timeout'
    sleep 1
  done
  PHASE=ready
fi
mkdir -p "$APP_DIR/seed-reports"
chmod 700 "$APP_DIR/seed-reports"
REPORT="$APP_DIR/seed-reports/$(date -u +%Y%m%dT%H%M%SZ)-apply.txt"
[ ! -e "$REPORT" ] || fail 'report name already exists'
set +e
seed_call apply --allow-bootstrap --api-url "http://api:$PORT" --operator-reference "$SEED_OPERATOR_REFERENCE" | tee "$REPORT"
RESULT=${PIPESTATUS[0]}
set -e
exit "$RESULT"
