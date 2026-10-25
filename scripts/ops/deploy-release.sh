#!/usr/bin/env bash
# H7-OPS-02, H7-OPS-RV-01..07 — deploys one release on the host from its candidate directory
# (docs/guides/containers.md#postgresql-roles-h7).
#
#   deploy-release.sh --app-dir <absolute dir> --release <commit sha> --image <registry/name>:<commit sha>
#                     --attempt <id> [--first-rollout-env <file in the app dir>]
#                     [--ready-timeout <s>] [--stability-window <s>] [--poll-interval <s>]
#
# The deploy workflow copies the candidate — docker-compose.prod.yml, Caddyfile and this script — to
# <dir>/releases/<sha>/ and runs this script there with --attempt <run id>-<run attempt>. Every step before the containers
# are recreated runs from the candidate (its Compose file and its Caddyfile) with the live `.env`/`.env.app` of <dir> and
# the immutable image: validate Compose and Caddy, pull, backup (DB-05), preflight (P28-01), migrate, reconcile the
# PostgreSQL roles (H7). A failure there leaves the live release and the running containers as they were.
#
# The live docker-compose.prod.yml, Caddyfile and releases/current-image are one release state. Each attempt claims its own
# <dir>/releases/<sha>/attempts/<id>/ (an existing one is refused, never rewritten) and keeps there, in replaced/, the
# state it replaces. Each file is replaced by one rename, then `api`, `worker`, `caddy` are recreated. The release is a
# success only when, within a bounded deadline, the API container runs the exact image and its readiness endpoint answers
# 2xx, the worker runs the same image and Caddy the promoted Caddyfile, and all three stay the same running containers,
# without a restart, for an observation window (H7-OPS-RV-04). Then releases/current-attempt names the attempt whose
# replaced/ is the way back. If a rename, the recreation, the readiness or that last record fails, the previous state is
# put back whole, the previous containers are brought back when needed, they are checked the same way, and the script
# exits 1 saying whether the release failed and whether the recovery is ready. On the first H7 rollout only,
# --first-rollout-env names the `.env` kept from before H7: it is restored before the previous image is recreated
# (H7-OPS-RV-06). The database keeps the migrations either way: the dump taken before them is the way back for the data.
#
# One deployment at a time on the host (H7-OPS-RV-07): before anything else, the script takes the lock
# <dir>/releases/.deploy.lock without waiting and keeps it until it exits; a second deployment — from the workflow or by
# hand — exits 2 at once and changes nothing. Needs util-linux `flock`.
#
# Removes no image, volume or orphan container. Never prints a credential: no `set -x`, no command here echoes the
# environment files, and the output of the Caddy validation (a Caddy log can carry environment values) is discarded.
set -euo pipefail

FIRST_ROLLOUT_ENV_PATH=''
fail() {
  echo "❌ $*" >&2
  if [ -n "$FIRST_ROLLOUT_ENV_PATH" ]; then
    echo "ℹ️ First H7 rollout: this failed before the promotion, so the live files are untouched and .env was not restored; follow the runbook (failure before the promotion)." >&2
  fi
  exit 1
}
refuse() {
  echo "refused: $*" >&2
  exit 2
}
usage() {
  echo 'Usage: deploy-release.sh --app-dir <absolute dir> --release <commit sha> --image <name>:<commit sha> --attempt <id> [--first-rollout-env <file in the app dir>] [--ready-timeout <s>] [--stability-window <s>] [--poll-interval <s>]' >&2
  exit 2
}

APP_DIR=''
RELEASE=''
IMAGE=''
ATTEMPT=''
FIRST_ROLLOUT_ENV=''
# Bounded readiness (H7-OPS-RV-04): wait at most READY_TIMEOUT seconds for the release to answer ready, then watch it for
# STABILITY_WINDOW seconds, looking every POLL_INTERVAL seconds. The workflow uses these defaults.
READY_TIMEOUT=120
STABILITY_WINDOW=20
POLL_INTERVAL=2
while [ "$#" -gt 0 ]; do
  [ "$#" -ge 2 ] || usage
  case "$1" in
    --app-dir) APP_DIR="$2" ;;
    --release) RELEASE="$2" ;;
    --image) IMAGE="$2" ;;
    --attempt) ATTEMPT="$2" ;;
    --first-rollout-env) FIRST_ROLLOUT_ENV="$2" ;;
    --ready-timeout) READY_TIMEOUT="$2" ;;
    --stability-window) STABILITY_WINDOW="$2" ;;
    --poll-interval) POLL_INTERVAL="$2" ;;
    *) usage ;;
  esac
  shift 2
done
case "$APP_DIR" in /*) ;; *) refuse '--app-dir must be an absolute path' ;; esac
[[ "$RELEASE" =~ ^[0-9a-f]{7,40}$ ]] || refuse '--release must be a commit sha'
# Immutable: the image is the one built from this very commit, never a moving tag such as `latest`.
[[ "$IMAGE" =~ ^[a-z0-9][a-z0-9./_-]*:${RELEASE}$ ]] || refuse '--image must be <name>:<the release sha>'
# H7-OPS-RV-05: given by the caller (the workflow: <run id>-<run attempt>), unique per deployment, one path segment.
[[ "$ATTEMPT" =~ ^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$ ]] && [ "$ATTEMPT" != latest ] && [ "$ATTEMPT" != current ] ||
  refuse '--attempt must be a new id of letters, digits, - and _ (the workflow passes <run id>-<run attempt>)'
[[ "$READY_TIMEOUT" =~ ^[0-9]{1,4}$ ]] && [ "$READY_TIMEOUT" -ge 1 ] && [ "$READY_TIMEOUT" -le 1800 ] ||
  refuse '--ready-timeout must be 1 to 1800 seconds'
[[ "$STABILITY_WINDOW" =~ ^[0-9]{1,3}$ ]] && [ "$STABILITY_WINDOW" -le 600 ] || refuse '--stability-window must be 0 to 600 seconds'
[[ "$POLL_INTERVAL" =~ ^([0-9]|[12][0-9]|30)(\.[0-9]{1,3})?$ ]] && [[ ! "$POLL_INTERVAL" =~ ^30\.[0-9]*[1-9] ]] ||
  refuse '--poll-interval must be 0 to 30 seconds'

RELEASE_DIR="$APP_DIR/releases/$RELEASE"
CURRENT_IMAGE="$APP_DIR/releases/current-image"
CURRENT_ATTEMPT="$APP_DIR/releases/current-attempt"
ATTEMPT_DIR="$RELEASE_DIR/attempts/$ATTEMPT"
REPLACED="$ATTEMPT_DIR/replaced"
cd "$APP_DIR"

# H7-OPS-RV-07: one deployment at a time on this host, whoever started it — the workflow, whose `concurrency` orders only
# its own jobs, or the runbook by hand. A kernel lock (flock) on releases/.deploy.lock, taken without waiting before this
# script reads anything of the host, claims an attempt or calls Docker, and held by descriptor 9 until the script and
# every command it started have ended: the readiness check, the success marker and the recovery included. An exit, an
# error, a signal or a lost SSH session releases it. The file staying behind proves nothing; never delete it (a new file
# would let a second deployment lock it while the first still holds the old one).
LOCK_FILE="$APP_DIR/releases/.deploy.lock"
command -v flock > /dev/null 2>&1 ||
  refuse "flock (util-linux) not found: the deployment lock of $APP_DIR cannot be taken; nothing was changed."
if [ -L "$LOCK_FILE" ] || { [ -e "$LOCK_FILE" ] && [ ! -f "$LOCK_FILE" ]; }; then
  refuse "$LOCK_FILE is not a regular file, so it cannot be the deployment lock; nothing was changed."
fi
{ exec 9<> "$LOCK_FILE"; } 2> /dev/null || refuse "cannot open the deployment lock $LOCK_FILE ($APP_DIR/releases/ holds the candidates); nothing was changed."
LOCK_STATUS=0
flock -n -E 3 9 || LOCK_STATUS=$?
if [ "$LOCK_STATUS" -eq 3 ]; then
  HOLDER="$(head -c 199 "$LOCK_FILE" 2> /dev/null | tr -cd 'A-Za-z0-9 ._:-' || true)"
  HOLDER="${HOLDER%"${HOLDER##*[! ]}"}"
  refuse "another deployment holds the deployment lock of $APP_DIR (it recorded: ${HOLDER:-nothing}). Release $RELEASE attempt $ATTEMPT did not start; nothing was changed. Wait for it to end — 'flock -n $LOCK_FILE true' exits 0 once it is free — and never delete $LOCK_FILE."
elif [ "$LOCK_STATUS" -ne 0 ]; then
  refuse "flock could not take the deployment lock $LOCK_FILE (exit $LOCK_STATUS); nothing was changed."
fi
# Who holds it, for whoever is refused or checks by hand: one fixed-size line written through the locked descriptor
# itself (no second open of the path), names only.
printf '%-199.199s\n' "pid $$ release $RELEASE attempt $ATTEMPT since $(date -u +%Y-%m-%dT%H:%M:%SZ)" >&9 ||
  echo "⚠️ the holder could not be recorded in $LOCK_FILE; the lock is held all the same." >&2

[ -f "$RELEASE_DIR/docker-compose.prod.yml" ] && [ -f "$RELEASE_DIR/Caddyfile" ] ||
  fail "the candidate $RELEASE_DIR has no docker-compose.prod.yml or Caddyfile"

# H7-OPS-RV-06: the first H7 rollout names the `.env` kept from before H7 (runbook step 2). Only a regular file directly in
# the application directory, other than the live environment files; never copied anywhere but back to .env.
if [ -n "$FIRST_ROLLOUT_ENV" ]; then
  name="${FIRST_ROLLOUT_ENV#"$APP_DIR"/}"
  case "$name" in
    '' | */* | . | .. | .env | .env.app) refuse "--first-rollout-env must name a file directly in $APP_DIR, other than .env and .env.app" ;;
  esac
  [ -f "$APP_DIR/$name" ] && [ ! -L "$APP_DIR/$name" ] ||
    refuse "--first-rollout-env $name is not a regular file of $APP_DIR (missing, a directory or a symbolic link)"
  # A release of this script already ran here: H7 is live and its rollback keeps the H7 environment.
  [ ! -e "$CURRENT_IMAGE" ] ||
    refuse '--first-rollout-env is for the first H7 rollout only: releases/current-image exists, so a release of this script is already live'
  FIRST_ROLLOUT_ENV_PATH="$APP_DIR/$name"
fi

# H7: `.env` feeds Compose interpolation only; `.env.app` is the application configuration and never a database credential.
[ -f .env ] || fail ".env not found in $APP_DIR; create it before deploying (runbook)."
[ -f .env.app ] || fail ".env.app not found in $APP_DIR (application settings apart from .env, H7); follow the runbook first."
if grep -Eq '^[[:space:]]*(export[[:space:]]+)?(POSTGRES_[A-Z_]*|DATABASE_[A-Z_]*|PG[A-Z]+)[[:space:]]*=' .env.app; then
  fail '.env.app names a database variable (POSTGRES_*, DATABASE_*, PG*); the API and the worker get the runtime role from Compose only.'
fi

# H7-OPS-RV-05: one mkdir that fails on an existing directory claims this attempt; an earlier attempt is never rewritten.
mkdir -p "$RELEASE_DIR/attempts"
if [ -e "$ATTEMPT_DIR" ]; then
  refuse "attempt $ATTEMPT of $RELEASE already exists ($ATTEMPT_DIR): every deployment needs a new --attempt, and an earlier attempt is never rewritten."
fi
mkdir "$ATTEMPT_DIR" 2> /dev/null ||
  refuse "attempt $ATTEMPT of $RELEASE already exists or cannot be created ($ATTEMPT_DIR); nothing was changed."
echo "🧾 Attempt $ATTEMPT of $RELEASE: its rollback evidence goes to $REPLACED"

export API_IMAGE="$IMAGE"
# CADDYFILE_PATH is the source of the Caddyfile mount of docker-compose.prod.yml (H7-OPS-RV-01): the candidate's own file
# for every command of the candidate, the live file for the live containers. Set per command, never exported, so no later
# Compose command inherits the candidate's path.
candidate() { CADDYFILE_PATH="$RELEASE_DIR/Caddyfile" docker compose --project-directory "$APP_DIR" -f "$RELEASE_DIR/docker-compose.prod.yml" "$@"; }
live() { CADDYFILE_PATH="$APP_DIR/Caddyfile" docker compose --project-directory "$APP_DIR" -f "$APP_DIR/docker-compose.prod.yml" "$@"; }

echo "🔎 Validating candidate $RELEASE with the live .env and .env.app..."
candidate config --quiet ||
  fail 'the candidate does not validate with .env/.env.app (missing POSTGRES_PASSWORD, DATABASE_DEPLOY_PASSWORD or DATABASE_RUNTIME_PASSWORD?).'

echo "🔎 Validating the candidate Caddyfile with Caddy..."
candidate run --rm --no-deps -T caddy caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile > /dev/null 2>&1 ||
  fail "the candidate Caddyfile does not validate; nothing was changed. See why with: CADDYFILE_PATH=$RELEASE_DIR/Caddyfile docker compose --project-directory $APP_DIR -f $RELEASE_DIR/docker-compose.prod.yml run --rm --no-deps -T caddy caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile"

echo "🚀 Pulling $API_IMAGE..."
candidate pull api worker || fail "cannot pull $API_IMAGE; nothing was changed."

echo "📦 Starting the database if it is not running (an existing container is not recreated)..."
candidate up -d --no-recreate postgres || fail 'cannot start the database; nothing was changed.'

echo "⏳ Waiting for PostgreSQL..."
READY=0
for attempt in $(seq 1 30); do
  if candidate exec -T postgres sh -c 'pg_isready -q -U "$POSTGRES_USER" -d "$POSTGRES_DB"'; then
    READY=1
    break
  fi
  sleep 2
done
[ "$READY" -eq 1 ] || fail 'PostgreSQL is not ready; nothing was backed up or migrated.'

# DB-05: back up before migrating, as the deploy role (H7). Never deleted here (scripts/ops/postgres-backup-retention.sh).
BACKUP_DIR="$APP_DIR/backups/postgres"
umask 077
mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"
BACKUP_FILE="$BACKUP_DIR/slm-pre-migrate-$(date -u +%Y%m%dT%H%M%SZ)-$RELEASE.dump"
echo "💾 Backing up as the deploy role: $BACKUP_FILE"
if ! candidate run --rm --no-deps -T backup pg_dump --format=custom --no-owner --no-privileges > "$BACKUP_FILE.partial"; then
  rm -f "$BACKUP_FILE.partial"
  fail 'pg_dump failed; nothing was migrated.'
fi
if [ ! -s "$BACKUP_FILE.partial" ] || ! candidate run --rm --no-deps -T backup pg_restore --list > /dev/null < "$BACKUP_FILE.partial"; then
  rm -f "$BACKUP_FILE.partial"
  fail 'the backup is empty or pg_restore --list cannot read it; nothing was migrated.'
fi
mv "$BACKUP_FILE.partial" "$BACKUP_FILE"
echo "✅ Backup readable ($(wc -c < "$BACKUP_FILE") bytes)."

# P28-01: read-only judgement of the history before `migrate deploy`; 2 means blocked, anything else but 0 is retried.
echo "🔎 Preflight (ops:preflight, read-only, deploy role)..."
PREFLIGHT_STATUS=1
for attempt in $(seq 1 3); do
  if candidate run --rm --no-deps \
    -e DB_CONNECT_TIMEOUT_MS=15000 \
    -e DB_TRANSACTION_MAX_WAIT_MS=10000 \
    -e DB_LOCK_TIMEOUT_MS=10000 \
    -e DB_STATEMENT_TIMEOUT_MS=15000 \
    -e DB_QUERY_TIMEOUT_MS=20000 \
    -e DB_TRANSACTION_TIMEOUT_MS=25000 \
    migrate node dist/migration-preflight-cli.js; then
    PREFLIGHT_STATUS=0
    break
  else
    PREFLIGHT_STATUS=$?
  fi
  [ "$PREFLIGHT_STATUS" -eq 2 ] && break
  echo "⚠️ ops:preflight failed (exit $PREFLIGHT_STATUS), retrying in 3 s ($attempt/3)..."
  sleep 3
done
[ "$PREFLIGHT_STATUS" -eq 0 ] || fail "ops:preflight blocks migrate deploy (exit $PREFLIGHT_STATUS); nothing was migrated."

echo "🔄 prisma migrate deploy (deploy role)..."
candidate run --rm --no-deps migrate node node_modules/prisma/build/index.js migrate deploy ||
  fail 'prisma migrate deploy failed; the live configuration and the running containers are unchanged.'

echo "🔐 ops:db-roles reconcile (deploy role)..."
candidate run --rm --no-deps migrate node dist/database-roles-cli.js reconcile ||
  fail 'ops:db-roles reconcile failed or the role matrix does not hold; the live configuration and the running containers are unchanged.'

# The readiness of the API from inside its container (no published port): its real endpoint, 2xx only, at most 5 s.
READY_PROBE='fetch("http://127.0.0.1:"+(process.env.PORT||3000)+"/"+(process.env.API_PREFIX||"api")+"/v1/health/ready",{signal:AbortSignal.timeout(5000)}).then(r=>process.exit(r.ok?0:1),()=>process.exit(1))'
# Compose and Docker reads of the live release, each bounded so that no look can hang.
live_ps() { CADDYFILE_PATH="$APP_DIR/Caddyfile" timeout 30 docker compose --project-directory "$APP_DIR" -f "$APP_DIR/docker-compose.prod.yml" ps -a -q "$1"; }

# One look at the live release (H7-OPS-RV-04). Each of api, worker and caddy has exactly one container, running and not
# restarting; api and worker run the image $1; Caddy mounts the live Caddyfile (same sha256); the API's readiness endpoint
# answers 2xx. Prints "<service>=<container>#<restart count> ..." and returns 0, or prints why not and returns 1. Prints
# no environment value: only names, states, images and container ids.
look() {
  local expected="$1" snapshot='' service ids count facts image status restarting restarts mounted wanted api=''
  for service in api worker caddy; do
    ids="$(live_ps "$service" 2> /dev/null)" || {
      echo "$service: its container cannot be listed"
      return 1
    }
    if [ -z "$ids" ]; then
      echo "$service: no container"
      return 1
    fi
    count="$(printf '%s\n' "$ids" | wc -l | tr -d ' ')"
    if [ "$count" -ne 1 ]; then
      echo "$service: $count containers"
      return 1
    fi
    facts="$(timeout 30 docker inspect --format '{{.Config.Image}}|{{.State.Status}}|{{.State.Restarting}}|{{.RestartCount}}' "$ids" 2> /dev/null)" || {
      echo "$service: container $ids cannot be inspected"
      return 1
    }
    IFS='|' read -r image status restarting restarts <<< "$facts"
    if [ "$restarting" = true ] || [ "$status" = restarting ]; then
      echo "$service: restarting"
      return 1
    fi
    if [ "$status" != running ]; then
      echo "$service: $status"
      return 1
    fi
    case "$service" in
      api | worker)
        if [ "$image" != "$expected" ]; then
          echo "$service: runs $image, not $expected"
          return 1
        fi
        ;;
      caddy)
        wanted="$(sha256sum "$APP_DIR/Caddyfile" 2> /dev/null | cut -d ' ' -f 1)" || wanted=''
        mounted="$(timeout 15 docker exec "$ids" sha256sum /etc/caddy/Caddyfile 2> /dev/null | cut -d ' ' -f 1)" || mounted=''
        if [ -z "$wanted" ] || [ "$mounted" != "$wanted" ]; then
          echo 'caddy: its /etc/caddy/Caddyfile is not the live Caddyfile'
          return 1
        fi
        ;;
    esac
    [ "$service" = api ] && api="$ids"
    snapshot="$snapshot $service=$ids#$restarts"
  done
  if ! timeout 15 docker exec "$api" node -e "$READY_PROBE" > /dev/null 2>&1; then
    echo 'api: its readiness endpoint did not answer 2xx'
    return 1
  fi
  echo "${snapshot# }"
}

# Names what changed between two looks: a container replaced (another deployment, a manual recreate) or restarted.
changes() {
  local before after service
  for before in $1; do
    service="${before%%=*}"
    for after in $2; do
      [ "${after%%=*}" = "$service" ] || continue
      if [ "${before%%#*}" != "${after%%#*}" ]; then
        printf '%s: replaced (%s → %s); ' "$service" "${before#*=}" "${after#*=}"
      elif [ "$before" != "$after" ]; then
        printf '%s: restarted (restart count %s → %s); ' "$service" "${before##*#}" "${after##*#}"
      fi
    done
  done
}

# The release with image $1 ($2 names it) is ready: one good look within READY_TIMEOUT seconds (polling), then the same
# containers, never restarted and still ready, at every look of a STABILITY_WINDOW-second window (at least two looks). A
# crash-looping worker restarts within that window. Returns 1, saying why, otherwise.
check_release() {
  local expected="$1" what="$2" deadline first now
  deadline=$((SECONDS + READY_TIMEOUT))
  until first="$(look "$expected")"; do
    if [ "$SECONDS" -ge "$deadline" ]; then
      echo "❌ $what is not ready after $READY_TIMEOUT s: $first" >&2
      return 1
    fi
    sleep "$POLL_INTERVAL"
  done
  echo "✅ $what answers ready; watching it for $STABILITY_WINDOW s..."
  deadline=$((SECONDS + STABILITY_WINDOW))
  while :; do
    sleep "$POLL_INTERVAL"
    if ! now="$(look "$expected")"; then
      echo "❌ $what did not stay ready: $now" >&2
      return 1
    fi
    if [ "$now" != "$first" ]; then
      echo "❌ $what did not stay the same: $(changes "$first" "$now")" >&2
      return 1
    fi
    [ "$SECONDS" -lt "$deadline" ] || break
  done
  return 0
}

# Puts one kept file back where it was, or removes the live one when there was none before ($1 kept copy, $2 live path).
restore() {
  if [ -f "$1" ]; then
    cp -p "$1" "$2.restore" && mv -f "$2.restore" "$2"
  else
    rm -f "$2"
  fi
}

# First H7 rollout only (H7-OPS-RV-06): keeps the `.env` of H7 beside it as .env.h7-<attempt> (0600; it holds the role
# passwords already provisioned, for the next attempt), then puts the `.env` from before H7 back in one rename, 0600.
# Neither file goes anywhere else (never under releases/) and nothing here prints them.
restore_environment() {
  local kept="$APP_DIR/.env.h7-$ATTEMPT"
  if [ -e "$kept" ]; then
    echo "⚠️ $kept already exists: .env was NOT restored (nothing overwritten)." >&2
    return 1
  fi
  if ! cp "$APP_DIR/.env" "$kept" || ! chmod 600 "$kept"; then
    echo "⚠️ the .env of H7 could not be kept as $kept: .env was NOT restored." >&2
    return 1
  fi
  rm -f "$APP_DIR/.env.restore"
  if ! cp "$FIRST_ROLLOUT_ENV_PATH" "$APP_DIR/.env.restore" || ! chmod 600 "$APP_DIR/.env.restore" ||
    ! mv -f "$APP_DIR/.env.restore" "$APP_DIR/.env"; then
    rm -f "$APP_DIR/.env.restore"
    echo "⚠️ .env could not be restored from ${FIRST_ROLLOUT_ENV_PATH##*/}; it is still the .env of H7." >&2
    return 1
  fi
  echo "↩️ .env restored from ${FIRST_ROLLOUT_ENV_PATH##*/}; the .env of H7 is kept as .env.h7-$ATTEMPT (0600)." >&2
}

# A rename, the recreation, the readiness or the record of the attempt failed (H7-OPS-RV-02, RV-04, RV-05). Puts the
# previous release state back whole. Brings the previous containers back when the new ones were created — and on the first
# H7 rollout in any case (the runbook stopped the old api/worker), after restoring the old `.env` (RV-06). Then checks
# the previous release as the new one was checked. Exits 1, saying that the release failed and whether the recovery is
# ready; a recovery whose commands succeeded but whose release is not ready is reported as failed.
recover() {
  local step="$1" restored=1 recreate="$RECREATED"
  set +e
  echo "❌ RESULT: release $RELEASE (attempt $ATTEMPT) FAILED while $step." >&2
  rm -f "$APP_DIR/.docker-compose.prod.yml.promote" "$APP_DIR/.Caddyfile.promote" "$APP_DIR/releases/.current-image.promote" \
    "$APP_DIR/releases/.current-attempt.promote"
  restore "$REPLACED/docker-compose.prod.yml" "$APP_DIR/docker-compose.prod.yml" || restored=0
  restore "$REPLACED/Caddyfile" "$APP_DIR/Caddyfile" || restored=0
  restore "$REPLACED/current-image" "$CURRENT_IMAGE" || restored=0
  restore "$REPLACED/current-attempt" "$CURRENT_ATTEMPT" || restored=0
  if [ "$restored" -eq 1 ]; then
    echo "↩️ previous release state restored (docker-compose.prod.yml, Caddyfile, releases/current-image, releases/current-attempt)." >&2
  else
    echo "⚠️ the previous release state was NOT restored completely: copy it back by hand from $REPLACED." >&2
  fi
  [ -n "$FIRST_ROLLOUT_ENV_PATH" ] && recreate=1
  if [ -z "$PREVIOUS_IMAGE" ] || [ "$restored" -eq 0 ] || [ ! -f "$APP_DIR/docker-compose.prod.yml" ]; then
    echo "⚠️ containers: return to a previous image not attempted (no previous release, or its files are not back)." >&2
    if [ -z "$PREVIOUS_IMAGE" ]; then
      echo "⚠️ RECOVERY: not possible — there is no previous release on this host." >&2
    else
      echo "⚠️ RECOVERY: FAILED — the previous release state is not back; restore it by hand (runbook)." >&2
    fi
  elif [ -n "$FIRST_ROLLOUT_ENV_PATH" ] && ! restore_environment; then
    echo "⚠️ RECOVERY: FAILED — the .env from before H7 is not back, so the previous image was not recreated (runbook)." >&2
  else
    local ready=1
    if [ "$recreate" -eq 0 ]; then
      echo "ℹ️ containers: untouched, still the previous release." >&2
    elif API_IMAGE="$PREVIOUS_IMAGE" CADDYFILE_PATH="$APP_DIR/Caddyfile" timeout 300 \
      docker compose --project-directory "$APP_DIR" -f "$APP_DIR/docker-compose.prod.yml" up -d --force-recreate api worker caddy; then
      echo "↩️ containers returned to the previous image $PREVIOUS_IMAGE." >&2
    else
      echo "⚠️ containers NOT returned to the previous image $PREVIOUS_IMAGE (exit $?): recreate api, worker and caddy by hand (runbook)." >&2
      ready=0
    fi
    if [ "$ready" -eq 1 ] && check_release "$PREVIOUS_IMAGE" "the previous release $PREVIOUS_IMAGE" >&2; then
      echo "✅ RECOVERY: the previous release $PREVIOUS_IMAGE is ready." >&2
    elif [ "$ready" -eq 1 ]; then
      echo "⚠️ RECOVERY: FAILED — the previous release $PREVIOUS_IMAGE is not ready (see above); bring it back by hand (runbook)." >&2
    else
      echo "⚠️ RECOVERY: FAILED — the previous containers could not be recreated." >&2
    fi
  fi
  echo "ℹ️ No migration was rolled back: the database keeps the migrations of $RELEASE. The dump taken before them: $BACKUP_FILE" >&2
  exit 1
}

# Every step before the recreation succeeded: promote the candidate as one release state.
echo "📌 Promoting candidate $RELEASE to the live release..."
mkdir "$REPLACED" || fail "cannot create $REPLACED; nothing was promoted."
# The previous state (exact files), for the recovery and a rollback; this attempt's own directory, written once.
for kept in docker-compose.prod.yml Caddyfile; do
  if [ -f "$APP_DIR/$kept" ]; then cp -p "$APP_DIR/$kept" "$REPLACED/$kept" || fail "cannot keep the live $kept; nothing was promoted."; fi
done
if [ -f "$CURRENT_IMAGE" ]; then cp -p "$CURRENT_IMAGE" "$REPLACED/current-image" || fail 'cannot keep releases/current-image; nothing was promoted.'; fi
if [ -f "$CURRENT_ATTEMPT" ]; then cp -p "$CURRENT_ATTEMPT" "$REPLACED/current-attempt" || fail 'cannot keep releases/current-attempt; nothing was promoted.'; fi
PREVIOUS_IMAGE=''
if [ -f "$CURRENT_IMAGE" ]; then
  PREVIOUS_IMAGE="$(head -n 1 "$CURRENT_IMAGE")"
elif [ -f "$APP_DIR/docker-compose.prod.yml" ]; then
  # A host deployed before releases/current-image existed: the image of its API container, running or stopped.
  API_CONTAINER="$(live ps -a -q api 2> /dev/null || true)"
  if [ -n "$API_CONTAINER" ]; then PREVIOUS_IMAGE="$(docker inspect --format '{{.Config.Image}}' "$API_CONTAINER" 2> /dev/null || true)"; fi
fi
# H7-OPS-RV-05: once ready, releases/current-attempt names the attempt whose replaced/ holds the release before this one.
# Deploying again the release already live replaces nothing worth going back to: the attempt that made it live stays.
MARK="releases/$RELEASE/attempts/$ATTEMPT"
if [ "$PREVIOUS_IMAGE" = "$API_IMAGE" ] && [ -f "$CURRENT_ATTEMPT" ] &&
  [[ "$(head -n 1 "$CURRENT_ATTEMPT")" == "releases/$RELEASE/attempts/"* ]]; then
  MARK="$(head -n 1 "$CURRENT_ATTEMPT")"
  echo "ℹ️ $RELEASE is already the live release: its way back stays $MARK/replaced."
fi

RECREATED=0
{ cp "$RELEASE_DIR/docker-compose.prod.yml" "$APP_DIR/.docker-compose.prod.yml.promote" &&
  cp "$RELEASE_DIR/Caddyfile" "$APP_DIR/.Caddyfile.promote" &&
  printf '%s\n' "$API_IMAGE" > "$APP_DIR/releases/.current-image.promote"; } || recover 'staging the candidate'
mv -f "$APP_DIR/.docker-compose.prod.yml.promote" "$APP_DIR/docker-compose.prod.yml" || recover 'replacing docker-compose.prod.yml'
mv -f "$APP_DIR/.Caddyfile.promote" "$APP_DIR/Caddyfile" || recover 'replacing Caddyfile'
mv -f "$APP_DIR/releases/.current-image.promote" "$CURRENT_IMAGE" || recover 'recording releases/current-image'

echo "♻️ Recreating api, worker and caddy with $API_IMAGE..."
RECREATED=1
live up -d --force-recreate api worker caddy || recover 'recreating api, worker and caddy'

# H7-OPS-RV-04: `up -d` returning 0 proves only that containers were created.
echo "⏳ Checking that release $RELEASE is ready (at most $READY_TIMEOUT s, then $STABILITY_WINDOW s of observation)..."
check_release "$API_IMAGE" "release $RELEASE" || recover 'checking that api, worker and caddy are ready'

{ printf '%s\n' "$MARK" > "$APP_DIR/releases/.current-attempt.promote"; } && mv -f "$APP_DIR/releases/.current-attempt.promote" "$CURRENT_ATTEMPT" || recover 'recording releases/current-attempt'

echo "🎉 Release $RELEASE is live and ready (attempt $ATTEMPT); its way back: $MARK/replaced"
