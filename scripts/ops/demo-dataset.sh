#!/usr/bin/env bash
# Runs `node dist/demo-dataset-cli.js` of the DEPLOYED image (pnpm ops:demo-dataset) against the running installation, with
# the settings and the two passwords taken from a private configuration file.
#
#   bash demo-dataset.sh --app-dir <absolute dir> --config <absolute path of the private file> --mode plan|apply
#
# It adds no seed, no SQL and no automatic run: the command writes every record through the HTTP API of the running API
# (and the demo sign-in accounts through the demo account contract), and nothing starts it but the operator. Needs Bash 4+
# and Docker Compose on the host; no Node or pnpm. Run `--mode plan` first, then `--mode apply`.
#
# The file (`.env.demo-dataset`, template `.env.demo-dataset.example`) is read as DATA: one NAME=VALUE per line, the value
# taken literally (no expansion, no code, no trimming; one pair of outer quotes is removed). Nothing in it is sourced. The
# two passwords go to the command on standard input (`--secrets-stdin`) through a pipe from a shell builtin: never an
# argument, never an environment variable of Docker, never a temporary file.
#
# Exit codes: the command's, passed through — 0 done or planned · 2 nothing to change · 4 some step in conflict or blocked
# · 3 refused, nothing written · 1 failed (rerun after fixing the cause) — and 3 also when this script refuses before Docker.
# The report (no password, no token) is printed and kept in <app-dir>/demo-dataset/ (owner-only).
set +x
set -euo pipefail
LC_ALL=C
umask 077

for inherited in "${!DEMO_@}"; do unset "$inherited"; done

refuse() {
  printf 'refused: %s\n' "$*" >&2
  printf 'The demo dataset command was not started; nothing was changed.\n' >&2
  exit 3
}
usage() {
  printf '%s\n' \
    'Usage: bash demo-dataset.sh --app-dir <absolute dir> --config <absolute path of the private file> --mode plan|apply' \
    '' \
    'Runs `node dist/demo-dataset-cli.js <mode>` of the image named by <app-dir>/releases/current-image against the running' \
    'API, with the settings and passwords of the private file (template .env.demo-dataset.example; keep it at mode 600).' \
    '--environment is always SHARED. The passwords are sent on standard input, never as arguments.' \
    'Exit: 0 done/planned · 2 nothing to change · 4 conflict or blocked step · 3 refused, nothing written · 1 failed.'
}

APP_DIR=''
CONFIG=''
MODE=''
while [ "$#" -gt 0 ]; do
  case "$1" in
    --help | -h)
      usage
      exit 0
      ;;
    --app-dir | --config | --mode)
      [ "$#" -ge 2 ] || refuse "$1 needs a value"
      case "$1" in
        --app-dir) APP_DIR="$2" ;;
        --config) CONFIG="$2" ;;
        --mode) MODE="$2" ;;
      esac
      shift 2
      ;;
    *) refuse 'unknown argument (a password is never an argument: it comes from the configuration file)' ;;
  esac
done
[ -n "$APP_DIR" ] || refuse '--app-dir is required (the application directory of the deployment)'
[ -n "$CONFIG" ] || refuse '--config is required (the private configuration file)'
case "$MODE" in plan | apply) ;; *) refuse '--mode must be plan or apply' ;; esac
case "$APP_DIR" in /*) ;; *) refuse '--app-dir must be an absolute path' ;; esac
case "$CONFIG" in /*) ;; *) refuse '--config must be an absolute path' ;; esac
command -v docker > /dev/null 2>&1 || refuse 'docker was not found on PATH'
[ -d "$APP_DIR" ] || refuse "the application directory $APP_DIR does not exist"
COMPOSE_FILE_PATH="$APP_DIR/docker-compose.prod.yml"
[ -f "$COMPOSE_FILE_PATH" ] || refuse "$COMPOSE_FILE_PATH not found: it is the live Compose file of the deployed release"

# --- The private file: owner-only, a regular file, plain text ---------------------------------------------------------
if [ -L "$CONFIG" ]; then refuse "the configuration file $CONFIG is a symbolic link; name the file itself"; fi
[ -f "$CONFIG" ] || refuse "the configuration file $CONFIG does not exist or is not a regular file"
file_facts="$(stat -c '%a %u' "$CONFIG")" || refuse "cannot read the mode and owner of $CONFIG"
file_mode="${file_facts%% *}"
file_owner="${file_facts##* }"
[ "$file_owner" = "$(id -u)" ] || refuse "the configuration file $CONFIG is owned by another user"
[[ "$file_mode" =~ ^[0-7]{3,4}$ ]] || refuse "unexpected mode of $CONFIG"
if (((8#$file_mode & 8#077) != 0)); then
  refuse "the configuration file $CONFIG has mode $file_mode: it holds passwords and must be readable by its owner only (chmod 600 $CONFIG)"
fi
size_all="$(wc -c < "$CONFIG")"
size_clean="$(tr -d '\000' < "$CONFIG" | wc -c)"
((size_all == size_clean)) || refuse "the configuration file $CONFIG contains a NUL byte"

# --- Parse as data: no eval, no source, no expansion of what the file says --------------------------------------------
REQUIRED_KEYS=(
  DEMO_FIXTURE
  DEMO_ORGANIZATION_NAME
  DEMO_OPERATOR_REFERENCE
  DEMO_SUPER_ADMIN_PASSWORD
  DEMO_ACCOUNT_PASSWORD
)
OPTIONAL_KEYS=(DEMO_API_URL)
declare -A CFG=()
carriage_return=$'\r'
line_number=0
while IFS= read -r line || [ -n "$line" ]; do
  line_number=$((line_number + 1))
  [[ "$line" != *"$carriage_return"* ]] ||
    refuse "line $line_number has a carriage return (Windows CRLF line ending), which would become part of a value; save the file with Unix (LF) line endings"
  [[ -z "${line//[[:space:]]/}" ]] && continue
  [[ "$line" == '#'* ]] && continue
  [[ "$line" == *=* ]] || refuse "line $line_number is not a KEY=VALUE setting"
  key="${line%%=*}"
  value="${line#*=}"
  known=0
  for candidate in "${REQUIRED_KEYS[@]}" "${OPTIONAL_KEYS[@]}"; do
    if [ "$key" = "$candidate" ]; then known=1; fi
  done
  [ "$known" = 1 ] || refuse "line $line_number names an unknown setting"
  [[ -z "${CFG[$key]+set}" ]] || refuse "line $line_number is a duplicate setting"
  case "$value" in
    \'* | \"*)
      quote="${value:0:1}"
      if [ "${#value}" -ge 2 ] && [ "${value: -1}" = "$quote" ]; then
        value="${value:1:${#value}-2}"
      else
        refuse "line $line_number has an unbalanced quote"
      fi
      ;;
  esac
  CFG[$key]="$value"
done < "$CONFIG"

for key in "${REQUIRED_KEYS[@]}"; do
  [[ -n "${CFG[$key]+set}" ]] || refuse "$key is required but missing from the configuration file"
  [[ -n "${CFG[$key]}" ]] || refuse "$key is required and must not be empty"
done
# The passwords travel as one NAME=value line each: a line feed inside one would split it.
for key in DEMO_SUPER_ADMIN_PASSWORD DEMO_ACCOUNT_PASSWORD; do
  [[ "${CFG[$key]}" != *$'\n'* ]] || refuse "$key must be one line"
done
if [ -n "${CFG[DEMO_API_URL]:-}" ]; then
  API_URL="${CFG[DEMO_API_URL]}"
  API_SOURCE='from DEMO_API_URL'
else
  API_URL='http://slm-api:3000'
  API_SOURCE='default: DEMO_API_URL is not set'
fi

# --- The deployed image: exactly the one the last deployment recorded, never `latest` or an inherited value --------------
IMAGE_FILE="$APP_DIR/releases/current-image"
[ -f "$IMAGE_FILE" ] && [ ! -L "$IMAGE_FILE" ] ||
  refuse "$IMAGE_FILE not found: it names the image of the deployed release (a deployment writes it)"
IMAGE=''
image_lines=0
while IFS= read -r image_line || [ -n "$image_line" ]; do
  image_lines=$((image_lines + 1))
  if [ "$image_lines" -eq 1 ]; then IMAGE="$image_line"; fi
done < "$IMAGE_FILE"
[ "$image_lines" -ge 1 ] || refuse "$IMAGE_FILE is empty"
[ "$image_lines" -eq 1 ] || refuse "$IMAGE_FILE must hold exactly one line, the image"
IMAGE_PATTERN='^[a-z0-9][a-z0-9./_-]*:[0-9a-f]{7,40}$'
[[ "$IMAGE" =~ $IMAGE_PATTERN ]] || refuse "$IMAGE_FILE must name an immutable image <name>:<commit sha>, never a moving tag"

# The one way this script talks to Docker: a one-off `run` of the api service (the runtime role, the API's own network) of
# the live Compose file, in the image chosen above. The running API is not restarted; no dependency is started.
compose_run() {
  API_IMAGE="$IMAGE" docker compose --project-directory "$APP_DIR" -f "$COMPOSE_FILE_PATH" \
    run --rm --no-deps -T api node dist/demo-dataset-cli.js "$@"
}

help_status=0
help_text="$(compose_run --help < /dev/null)" || help_status=$?
[ "$help_status" -eq 0 ] ||
  refuse "'demo-dataset-cli.js --help' of $IMAGE failed (exit $help_status): the deployed image has no demo dataset command; deploy an image that contains it first (nothing was sent)"
case "$help_text" in
  *--secrets-stdin*) ;;
  *) refuse "the deployed image $IMAGE has no --secrets-stdin mode of the demo dataset command; deploy a newer image first" ;;
esac

REPORT_DIR="$APP_DIR/demo-dataset"
mkdir -p "$REPORT_DIR"
REPORT="$REPORT_DIR/$(date -u +%Y%m%dT%H%M%SZ)-${CFG[DEMO_FIXTURE]//[^A-Za-z0-9._-]/_}-$MODE.txt"

args=(
  "$MODE"
  "--fixture=${CFG[DEMO_FIXTURE]}"
  "--organization=${CFG[DEMO_ORGANIZATION_NAME]}"
  "--api-url=$API_URL"
  "--operator=${CFG[DEMO_OPERATOR_REFERENCE]}"
  --environment=SHARED
  --secrets-stdin
)

echo "Running the demo dataset command ($MODE) of $IMAGE against $API_URL (settings and passwords from $CONFIG)."
# The report starts with what a failure is read against (no setting but the API origin, no password) and keeps the
# command's standard error too: its refusal, warning and failure lines (phase, time, kind and code of the error) are
# worded to carry no secret, and without them a failed run left a report with nothing in it.
printf 'Demo dataset %s — image %s — API %s (%s) — started %s\n' \
  "$MODE" "$IMAGE" "$API_URL" "$API_SOURCE" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$REPORT"
run_started=$SECONDS
run_status=0
set +e
# The passwords go through a pipe from a builtin: they are in no process's argument list, no environment and no file.
builtin printf 'SUPER_ADMIN_PASSWORD=%s\nDEMO_ACCOUNT_PASSWORD=%s\n' \
  "${CFG[DEMO_SUPER_ADMIN_PASSWORD]}" "${CFG[DEMO_ACCOUNT_PASSWORD]}" 2> /dev/null |
  compose_run "${args[@]}" 2>&1 | tee -a "$REPORT"
run_status="${PIPESTATUS[1]}"
set -e
unset CFG
printf 'Finished: exit %s after %s s\n' "$run_status" "$((SECONDS - run_started))" >> "$REPORT"

echo "Report kept in $REPORT."
case "$run_status" in
  0) [ "$MODE" = plan ] && echo 'Planned: read the report, then run again with --mode apply.' || echo 'Applied: check the data through the API (runbook, "Kiểm tra sau khi nạp").' ;;
  2) echo 'Nothing to change: every step of the dataset is already there.' ;;
  4) echo 'Some steps are in conflict or blocked (see the report); the others ran. Nothing was overwritten.' >&2 ;;
  3) echo 'Refused before anything was written (see the reason above).' >&2 ;;
  *) echo "The command exited $run_status. The report says which steps were done; fix the cause and run it again: it goes on from there." >&2 ;;
esac
exit "$run_status"
