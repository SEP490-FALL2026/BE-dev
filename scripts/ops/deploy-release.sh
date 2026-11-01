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
# state it replaces. Each file is replaced by one rename, then the old worker is stopped, the new API is checked ready,
# and worker/Caddy are recreated without restarting that API. The release is a
# success only when, within a bounded deadline, the API container runs the exact image and its readiness endpoint answers
# 2xx, the worker runs the same image and Caddy the promoted Caddyfile, and all three stay the same running containers,
# without a restart, for an observation window (H7-OPS-RV-04). Then releases/current-attempt names the attempt whose
# replaced/ is the way back. If a rename, the recreation, the readiness or that last record fails, the previous state is
# put back whole, the previous containers are brought back when needed, they are checked the same way, and the script
# exits 1 saying whether the release failed and whether the recovery is ready. On the first H7 rollout only,
# --first-rollout-env names the `.env` kept from before H7: it is restored before the previous image is recreated
# (H7-OPS-RV-06). The database keeps the migrations either way: the dump taken before them is the way back for the data.
#
# The previous image is brought back only when it can read the database as it is (P04-CPE-04, spec L.12): before
# `migrate deploy` the way back is judged once (an image that cannot be inspected, or a database no release ever ran on,
# stops the deploy there), and again in the recovery, after the failed release's api and worker are stopped. An image
# that cannot read rows the failed release wrote is not recreated: the recovery is REFUSED and says so, never a success.
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
READY_TIMEOUT=300
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
live() { CADDYFILE_PATH="$APP_DIR/Caddyfile" timeout 120 docker compose --project-directory "$APP_DIR" -f "$APP_DIR/docker-compose.prod.yml" "$@"; }

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

# P04-CPE-04 (spec L.12): an image is a way back only if it can read the database as it is. A green readiness probe does
# not say it (readiness pings the database). The labels of the image declare the data representations its runtime reads
# (an image built before that label declares none); the candidate's read-only `ops:preflight --recovery-target` counts the
# rows of each one this database holds. Returns 0 it can, 2 it cannot read rows that are there, 3 no migration ever ran on
# this database (no release ran on it, so no image is its way back), 4 the image cannot be inspected (not on this host:
# what it reads is unknown), anything else the judgement failed. A failure that is neither 0, 2 nor 3 is tried three times,
# each run bounded to 120 s. The judgement prints names and counts only.
judge_way_back() {
  local labels status=1 try
  labels="$(timeout 30 docker image inspect --format '{{json .Config.Labels}}' "$PREVIOUS_IMAGE" 2> /dev/null)" || return 4
  for try in 1 2 3; do
    status=0
    CADDYFILE_PATH="$RELEASE_DIR/Caddyfile" timeout 120 \
      docker compose --project-directory "$APP_DIR" -f "$RELEASE_DIR/docker-compose.prod.yml" run --rm --no-deps \
      -e DB_CONNECT_TIMEOUT_MS=15000 \
      -e DB_TRANSACTION_MAX_WAIT_MS=10000 \
      -e DB_LOCK_TIMEOUT_MS=10000 \
      -e DB_STATEMENT_TIMEOUT_MS=15000 \
      -e DB_QUERY_TIMEOUT_MS=20000 \
      -e DB_TRANSACTION_TIMEOUT_MS=25000 \
      migrate node dist/migration-preflight-cli.js --recovery-target "$labels" || status=$?
    case "$status" in 0 | 2 | 3) return "$status" ;; esac
    if [ "$try" -lt 3 ]; then
      echo "⚠️ ops:preflight --recovery-target failed (exit $status), retrying in 3 s ($try/3)..."
      sleep 3
    fi
  done
  return "$status"
}

# The way back of this deployment: the release live now. None on a host that never ran a release — a failure after the
# promotion then has nothing to bring back and the installation stays failed.
PREVIOUS_IMAGE=''
if [ -f "$CURRENT_IMAGE" ]; then
  PREVIOUS_IMAGE="$(head -n 1 "$CURRENT_IMAGE")"
elif [ -f "$APP_DIR/docker-compose.prod.yml" ]; then
  # A host deployed before releases/current-image existed: the image of its API container, running or stopped.
  API_CONTAINER="$(live ps -a -q api 2> /dev/null || true)"
  if [ -n "$API_CONTAINER" ]; then PREVIOUS_IMAGE="$(docker inspect --format '{{.Config.Image}}' "$API_CONTAINER" 2> /dev/null || true)"; fi
fi
if [ -z "$PREVIOUS_IMAGE" ]; then
  echo "ℹ️ No previous release on this host: if release $RELEASE fails after the promotion, nothing is brought back (the installation stays failed)."
else
  echo "🔎 Way back: can $PREVIOUS_IMAGE serve this database (ops:preflight --recovery-target, read-only, deploy role)?"
  WAY_BACK=0
  judge_way_back || WAY_BACK=$?
  case "$WAY_BACK" in
    0) echo "✅ $PREVIOUS_IMAGE reads every row this database holds: it is the way back of this deployment until this release writes one it cannot read." ;;
    2) echo "⚠️ $PREVIOUS_IMAGE cannot read rows this database already holds (above): if this release fails after the promotion it will NOT be brought back; the way out is a fixed release (runbook: way back refused)." ;;
    3) fail "releases/current-image (or the api container) names $PREVIOUS_IMAGE, but this database has no migration history: no release ever ran on it, so $PREVIOUS_IMAGE is not its way back. To install fresh over an old release state, move that state aside first (runbook: fresh installation); nothing was migrated." ;;
    4) fail "the previous release $PREVIOUS_IMAGE, the way back of this deployment, cannot be inspected on this host (not pulled here?), so what it reads is unknown: 'docker pull $PREVIOUS_IMAGE', then deploy again with a new --attempt; nothing was migrated." ;;
    *) fail "ops:preflight --recovery-target failed (exit $WAY_BACK): the way back cannot be judged; nothing was migrated." ;;
  esac
fi

echo "🔄 prisma migrate deploy (deploy role)..."
candidate run --rm --no-deps migrate node node_modules/prisma/build/index.js migrate deploy ||
  fail 'prisma migrate deploy failed; the live configuration and the running containers are unchanged.'

echo "🔐 ops:db-roles reconcile (deploy role)..."
candidate run --rm --no-deps migrate node dist/database-roles-cli.js reconcile ||
  fail 'ops:db-roles reconcile failed or the role matrix does not hold; the live configuration and the running containers are unchanged.'

# The readiness of the API from inside its container (no published port): its real endpoint, 2xx only, at most 10 s. What a failed
# probe prints is the HTTP status and, from the error envelope of the API, its machine code and request id, or the class and code of a
# failed fetch: never a body or a message, which can carry a host, a role or a secret (F93). The exec in `look` ends it at 15 s.
READY_PROBE='const s=(v,r)=>typeof v==="string"&&r.test(v)?v:"";fetch("http://127.0.0.1:"+(process.env.PORT||3000)+"/"+(process.env.API_PREFIX||"api")+"/v1/health/ready",{signal:AbortSignal.timeout(10000)}).then(async r=>{if(!r.ok){let e={};try{e=JSON.parse(await r.text()).error||{}}catch(_){}const c=s(e.code,/^[A-Z][A-Z0-9_]*(\.[A-Z0-9_]+)*$/).slice(0,64);const q=s(e.requestId,/^[A-Za-z0-9-]{1,64}$/);console.error("HTTP "+r.status+(c?" "+c:"")+(q?" request "+q:""))}process.exit(r.ok?0:1)},e=>{const n=s(e&&e.name,/^[A-Za-z]{1,40}$/)||"Error";const k=s(e&&e.cause&&e.cause.code,/^[A-Z0-9_]{2,32}$/);console.error("fetch failed: "+n+(k?" "+k:""));process.exit(1)})'
# Compose and Docker reads of the live release, each bounded so that no look can hang.
live_ps() { CADDYFILE_PATH="$APP_DIR/Caddyfile" timeout 30 docker compose --project-directory "$APP_DIR" -f "$APP_DIR/docker-compose.prod.yml" ps -a -q "$1"; }

# Host evidence must not depend on Docker responding. Sample cumulative counters at each look so deltas expose
# CPU/steal, swap-in/out and I/O stalls across the actual failure, rather than only after rollback starts.
DIAGNOSTICS_DIR=''
host_sample() (
  umask 077
  [ -d "$DIAGNOSTICS_DIR" ] || exit 0
  local file="$DIAGNOSTICS_DIR/host-timeline.txt" source
  # Always retain the final host state even if a long startup exhausted the timeline's budget.
  [ "$1" != failure ] || file="$DIAGNOSTICS_DIR/host-failure.txt"
  # Leave room for one bounded sample without growing indefinitely during a slow startup.
  [ ! -f "$file" ] || [ "$(wc -c < "$file")" -lt 983040 ] || exit 0
  {
    printf '\nphase=%s seconds=%s\n' "$1" "$SECONDS"
    date -u +%Y-%m-%dT%H:%M:%SZ
    for source in /proc/loadavg /proc/meminfo /proc/stat /proc/vmstat /proc/diskstats /proc/pressure/cpu /proc/pressure/io /proc/pressure/memory; do
      if [ -r "$source" ]; then
        printf '%s\n' "$source"
        head -c 8192 "$source"
      fi
    done
  } 2>&1 | head -c 65536 >> "$file"
)

# One look at the live release (H7-OPS-RV-04). Each of api, worker and caddy has exactly one container, running and not
# restarting; api and worker run the image $1; Caddy mounts the live Caddyfile (same sha256); the API's readiness endpoint
# answers 2xx. Prints "<service>=<container>#<restart count> ..." and returns 0, or prints why not and returns 1. Prints
# no environment value: only names, states, images and container ids.
look() {
  local expected="$1" services="${2:-api worker caddy}" snapshot='' service ids count facts image status restarting restarts mounted wanted api=''
  host_sample look > /dev/null 2>&1 || true
  for service in $services; do
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
    # look runs in command substitution: persist IDs privately, rather than lose shell variables in its subshell.
    if [ -d "$DIAGNOSTICS_DIR" ]; then
      (umask 077; printf '%s\n' "$ids" > "$DIAGNOSTICS_DIR/$service-id.txt") 2> /dev/null || true
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
  local probe_err='' probe_status=0
  probe_err="$(timeout 15 docker exec "$api" node -e "$READY_PROBE" 2>&1)" || probe_status=$?
  if [ "$probe_status" -ne 0 ]; then
    host_sample probe-failed > /dev/null 2>&1 || true
    # One short line: the probe prints a status and codes only, but the exec around it can print its own errors (F93).
    probe_err="${probe_err//$'\n'/ }"
    probe_err="${probe_err:0:200}"
    echo "api: readiness probe failed (probe exit $probe_status; ${probe_err:-no output})"
    if [ "$probe_status" -eq 124 ]; then
      echo 'api: docker exec/probe exceeded 15 s; this alone does not establish an HTTP failure'
    fi
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

# One Node application starts at a time. Stop the old worker too: leaving it polling the database while the new API
# loads defeats the point of staging. --no-deps prevents Compose from implicitly recreating an already-ready API.
# The full release check below still runs after worker/Caddy start; API readiness alone never commits a release.
STARTED_API=''
START_STEP=''
RELEASE_READY_DEADLINE=0
start_release() {
  local expected="$1" what="$2" deadline first
  STARTED_API=''
  START_STEP='stopping the previous worker'
  echo "⏹️ $what: stopping worker before API startup..." >&2
  live stop worker || return 1
  START_STEP='recreating api, worker and caddy'
  echo "▶️ $what: starting API alone..." >&2
  host_sample api-start > /dev/null 2>&1 || true
  live up -d --no-deps --force-recreate api || return 1
  START_STEP='checking that api, worker and caddy are ready'
  RELEASE_READY_DEADLINE=$((SECONDS + READY_TIMEOUT))
  deadline="$RELEASE_READY_DEADLINE"
  until first="$(look "$expected" api)"; do
    if [ "$SECONDS" -ge "$deadline" ]; then
      echo "❌ $what is not ready after $READY_TIMEOUT s: $first" >&2
      return 2
    fi
    sleep "$POLL_INTERVAL"
  done
  STARTED_API="$first"
  echo "✅ $what: API answers ready; starting worker, then Caddy..." >&2
  host_sample api-ready > /dev/null 2>&1 || true
  START_STEP='recreating api, worker and caddy'
  live up -d --no-deps --force-recreate worker || return 1
  live up -d --no-deps --force-recreate caddy || return 1
}

# The release with image $1 ($2 names it) is ready: one good look within READY_TIMEOUT seconds (polling), then the same
# containers, never restarted and still ready, at every look of a STABILITY_WINDOW-second window (at least two looks). A
# crash-looping worker restarts within that window. Returns 1, saying why, otherwise.
check_release() {
  local expected="$1" what="$2" deadline first now
  # API-only readiness and the first full ready look share one startup budget, rather than silently doubling it.
  if [ "$RELEASE_READY_DEADLINE" -gt 0 ]; then
    deadline="$RELEASE_READY_DEADLINE"
  else
    deadline=$((SECONDS + READY_TIMEOUT))
  fi
  until first="$(look "$expected")"; do
    if [ "$SECONDS" -ge "$deadline" ]; then
      echo "❌ $what is not ready after $READY_TIMEOUT s: $first" >&2
      return 1
    fi
    sleep "$POLL_INTERVAL"
  done
  # Retain the API identity/restart baseline from before the worker started, not just from the first full look.
  if [ -n "$STARTED_API" ] && [ "${first%% *}" != "$STARTED_API" ]; then
    echo "❌ $what did not stay the same: $(changes "$STARTED_API" "$first")" >&2
    return 1
  fi
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

# P04-CPE-04 (spec L.12): before the previous image is recreated. The failed release may have served requests, so the
# database may hold rows the previous image cannot read — written before the readiness failed, or a moment before the
# recovery. Its api and worker are stopped first, through the candidate's own Compose file (validated above; same project),
# so they write nothing more; then the way back is judged on the database as it is. Returns 0 when the previous image can
# serve it. Otherwise prints `RECOVERY: REFUSED` and why, and returns 1: the previous image is not recreated (an image that
# fails on the data is no recovery), and the stopped release stays stopped.
way_back_open() {
  local status=0
  if [ "$RECREATED" -eq 1 ]; then
    echo "⏹️ stopping api and worker of the failed release before judging the way back (they write nothing more)..." >&2
    if ! CADDYFILE_PATH="$RELEASE_DIR/Caddyfile" timeout 120 \
      docker compose --project-directory "$APP_DIR" -f "$RELEASE_DIR/docker-compose.prod.yml" stop api worker; then
      echo "⚠️ RECOVERY: REFUSED — api and worker of the failed release could not be stopped, so rows it may still write cannot be ruled out; $PREVIOUS_IMAGE was not recreated. Stop them by hand, then follow the runbook (way back)." >&2
      return 1
    fi
  fi
  judge_way_back >&2 || status=$?
  case "$status" in
    0) return 0 ;;
    2) echo "⚠️ RECOVERY: REFUSED — $PREVIOUS_IMAGE cannot read rows release $RELEASE wrote (above), so it was not recreated: api and worker are stopped and no image serves the API. The way out is a fixed release deployed with a new --attempt (runbook: way back refused)." >&2 ;;
    4) echo "⚠️ RECOVERY: REFUSED — $PREVIOUS_IMAGE cannot be inspected on this host, so what it reads is unknown; it was not recreated (runbook: way back refused)." >&2 ;;
    *) echo "⚠️ RECOVERY: REFUSED — the way back could not be judged (exit $status), so $PREVIOUS_IMAGE was not recreated (runbook: way back refused)." >&2 ;;
  esac
  return 1
}

# Private, bounded evidence before rollback destroys the candidate containers. Raw application logs may contain
# sensitive data: never print them to Actions, never dump inspect/config/environment, never upload automatically.
# A subshell keeps permissions local; bounded tails are also capped at 1 MiB per file.
capture_startup_timings() (
  umask 077
  [ -d "$DIAGNOSTICS_DIR" ] || exit 0
  local service ids id
  for service in api worker; do
    ids=''
    [ ! -f "$DIAGNOSTICS_DIR/$service-id.txt" ] || read -r ids < "$DIAGNOSTICS_DIR/$service-id.txt" || true
    [ -n "$ids" ] || ids="$(live_ps "$service" 2> /dev/null)" || ids=''
    read -r id <<< "$ids"
    [ -n "$id" ] || continue
    {
      printf 'container=%s\n' "$id"
      timeout 5 docker logs --timestamps --tail 2000 "$id" 2>&1 | grep '"context":"StartupTiming"'
    } | head -c 65536 > "$DIAGNOSTICS_DIR/$service-startup.log"
  done
  return 0
)

capture_diagnostics() (
  umask 077
  local dir="$DIAGNOSTICS_DIR" service ids id status
  [ -n "$dir" ] && [ -d "$dir" ] || exit 1
  host_sample failure || true
  {
    date -u
    timeout 3 uptime
    timeout 3 free -m
    timeout 3 df -h "$APP_DIR"
    # Only command names, never arguments or environment (both can contain credentials).
    timeout 3 ps -eo pid,ppid,stat,pcpu,pmem,rss,comm --sort=-pcpu
    timeout 4 vmstat 1 2
    timeout 5 docker stats --no-stream
  } 2>&1 | head -c 1048576 > "$dir/resources.txt"
  for service in api worker caddy; do
    # Prefer IDs observed while verifying this release: avoid another 30 s Compose lookup during a daemon stall.
    ids=''
    [ ! -f "$dir/$service-id.txt" ] || read -r ids < "$dir/$service-id.txt" || true
    [ -n "$ids" ] || ids="$(live_ps "$service" 2> /dev/null)" || ids=''
    # At most one container per service; record what exists even after a partial recreation.
    read -r id <<< "$ids"
    [ -n "$id" ] || continue
    timeout 5 docker inspect --format \
      '{{.Id}} image={{.Config.Image}} status={{.State.Status}} exit={{.State.ExitCode}} oom={{.State.OOMKilled}} restarts={{.RestartCount}} started={{.State.StartedAt}} finished={{.State.FinishedAt}}' \
      "$id" 2>&1 | head -c 1048000 > "$dir/$service-state.txt"
    status=0
    timeout 5 docker logs --timestamps --tail 200 "$id" 2>&1 | head -c 1048576 > "$dir/$service.log"
    status=${PIPESTATUS[0]}
    printf 'logs exit=%s\n' "$status" >> "$dir/$service-state.txt"
  done
  capture_startup_timings || true
  return 0
)

# A rename, the recreation, the readiness or the record of the attempt failed (H7-OPS-RV-02, RV-04, RV-05). Puts the
# previous release state back whole. Brings the previous containers back when the new ones were created — and on the first
# H7 rollout in any case (the runbook stopped the old api/worker), after restoring the old `.env` (RV-06). Then checks
# the previous release as the new one was checked. Exits 1, saying that the release failed and whether the recovery is
# ready; a recovery whose commands succeeded but whose release is not ready is reported as failed.
recover() {
  local step="$1" restored=1 recreate="$RECREATED"
  set +e
  echo "❌ RESULT: release $RELEASE (attempt $ATTEMPT) FAILED while $step." >&2
  if [ "$RECREATED" -eq 1 ]; then
    if capture_diagnostics > /dev/null 2>&1; then
      echo "Diagnostics (private, best effort): $APP_DIR/.deploy-diagnostics-$RELEASE-$ATTEMPT; review on the VPS before sharing." >&2
    else
      echo 'Diagnostics incomplete or unavailable; continuing recovery.' >&2
    fi
  fi
  # Preserve candidate IDs/timeline: recovery checks must not overwrite them with the previous release.
  DIAGNOSTICS_DIR=''
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
  elif [ "$recreate" -eq 1 ] && ! way_back_open; then
    : # way_back_open said why: RECOVERY: REFUSED.
  elif [ -n "$FIRST_ROLLOUT_ENV_PATH" ] && ! restore_environment; then
    echo "⚠️ RECOVERY: FAILED — the .env from before H7 is not back, so the previous image was not recreated (runbook)." >&2
  else
    local ready=1
    if [ "$recreate" -eq 0 ]; then
      echo "ℹ️ containers: untouched, still the previous release." >&2
    elif API_IMAGE="$PREVIOUS_IMAGE" start_release "$PREVIOUS_IMAGE" "the previous release $PREVIOUS_IMAGE"; then
      echo "↩️ containers returned to the previous image $PREVIOUS_IMAGE." >&2
    else
      local start_status=$?
      if [ "$start_status" -eq 2 ]; then
        ready=2
      else
        echo "⚠️ containers NOT returned to the previous image $PREVIOUS_IMAGE (exit $start_status): recreate api, worker and caddy by hand (runbook)." >&2
        ready=0
      fi
    fi
    if [ "$ready" -eq 1 ] && check_release "$PREVIOUS_IMAGE" "the previous release $PREVIOUS_IMAGE" >&2; then
      echo "✅ RECOVERY: the previous release $PREVIOUS_IMAGE is ready." >&2
    elif [ "$ready" -eq 1 ] || [ "$ready" -eq 2 ]; then
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
# Per-attempt evidence also survives a successful deploy, for comparison with intermittent failures. No background
# sampler or extra Node process is introduced; collection failures must never prevent a deploy or its recovery.
if (umask 077; mkdir -m 700 "$APP_DIR/.deploy-diagnostics-$RELEASE-$ATTEMPT") 2> /dev/null; then
  DIAGNOSTICS_DIR="$APP_DIR/.deploy-diagnostics-$RELEASE-$ATTEMPT"
else
  echo 'Host diagnostics unavailable: cannot create a new private directory; existing evidence is not overwritten.' >&2
fi
host_sample before-recreate > /dev/null 2>&1 || true
RECREATED=1
start_release "$API_IMAGE" "release $RELEASE" || recover "$START_STEP"

# H7-OPS-RV-04: `up -d` returning 0 proves only that containers were created.
echo "⏳ Checking that release $RELEASE is ready (at most $READY_TIMEOUT s, then $STABILITY_WINDOW s of observation)..."
check_release "$API_IMAGE" "release $RELEASE" || recover 'checking that api, worker and caddy are ready'
capture_startup_timings > /dev/null 2>&1 || true

{ printf '%s\n' "$MARK" > "$APP_DIR/releases/.current-attempt.promote"; } && mv -f "$APP_DIR/releases/.current-attempt.promote" "$CURRENT_ATTEMPT" || recover 'recording releases/current-attempt'

echo "🎉 Release $RELEASE is live and ready (attempt $ATTEMPT); its way back: $MARK/replaced"
[ ! -d "$DIAGNOSTICS_DIR" ] || echo "Host timeline (private): $DIAGNOSTICS_DIR/host-timeline.txt"
[ ! -d "$DIAGNOSTICS_DIR" ] || echo "Startup timings (private): $DIAGNOSTICS_DIR/api-startup.log; $DIAGNOSTICS_DIR/worker-startup.log"
