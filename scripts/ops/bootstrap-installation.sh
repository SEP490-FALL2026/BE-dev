#!/usr/bin/env bash
# Prompt 06 — runs the installation command of the DEPLOYED image once, with the organization, its first department and the
# Super Admin taken from a private configuration file instead of typed arguments and a hidden prompt.
#
#   bash bootstrap-installation.sh --app-dir <absolute dir> --config <absolute path of the private file>
#
# It reuses `node dist/installation-cli.js` (the same service, validation, transaction and Audit Trail as a hand run); it
# adds no seed, no SQL and no automatic installation, and nothing starts it but the operator. Needs Bash 4+ and Docker
# Compose on the host; no Node or pnpm. Run it after a green deployment, once, on an empty database.
#
# The file (`.env.bootstrap`, template `.env.bootstrap.example`) is read as DATA: one NAME=VALUE per line, the value taken
# literally (no expansion, no code, no trimming; one pair of outer quotes is removed). Nothing in it is evaluated or sourced.
# The password is the value of BOOTSTRAP_ADMIN_PASSWORD and goes to the command on standard input (`--password-stdin`) through
# a pipe from a shell builtin: never an argument, never an environment variable of Docker, never a temporary file.
#
# Exit codes: 0 installed · 2 already installed · 130 cancelled · 1 failure (all the installation command's, passed through;
# 1 does not prove nothing was written: a lost reply to COMMIT can hide an installation — inspect before running again)
# · 3 refused before the command was started (this script found a problem; nothing was changed).
#
# Never prints a value of the file. No `set -x`: tracing is switched off before anything is read.
set +x
set -euo pipefail
# Bytes, not locale rules: names and the image tag are checked as ASCII, values pass through untouched (UTF-8 included).
LC_ALL=C
umask 077

# A variable the caller exported must never stand in for the file or reach Docker.
for inherited in "${!BOOTSTRAP_@}"; do unset "$inherited"; done

refuse() {
  printf 'refused: %s\n' "$*" >&2
  printf 'The installation command was not started; nothing was changed.\n' >&2
  exit 3
}
usage() {
  printf '%s\n' \
    'Usage: bash bootstrap-installation.sh --app-dir <absolute dir> --config <absolute path of the private file>' \
    '' \
    'Runs `node dist/installation-cli.js` of the image named by <app-dir>/releases/current-image once, with the settings and' \
    'the Super Admin password of the private file (template .env.bootstrap.example; keep it at mode 600). --environment is' \
    'always SHARED. The password is sent on standard input, never as an argument.' \
    'Exit: 0 installed · 2 already installed · 130 cancelled · 1 failure (inspect before rerunning) · 3 refused, not started.'
}

APP_DIR=''
CONFIG=''
while [ "$#" -gt 0 ]; do
  case "$1" in
    --help | -h)
      usage
      exit 0
      ;;
    --app-dir | --config)
      [ "$#" -ge 2 ] || refuse "$1 needs a value"
      if [ "$1" = --app-dir ]; then APP_DIR="$2"; else CONFIG="$2"; fi
      shift 2
      ;;
    *) refuse 'unknown argument (the password is never an argument: it comes from the configuration file)' ;;
  esac
done
[ -n "$APP_DIR" ] || refuse '--app-dir is required (the application directory of the deployment)'
[ -n "$CONFIG" ] || refuse '--config is required (the private configuration file)'
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
  refuse "the configuration file $CONFIG has mode $file_mode: it holds the Super Admin password and must be readable by its owner only (chmod 600 $CONFIG)"
fi
size_all="$(wc -c < "$CONFIG")"
size_clean="$(tr -d '\000' < "$CONFIG" | wc -c)"
(( size_all == size_clean )) || refuse "the configuration file $CONFIG contains a NUL byte"

# --- Parse as data: no eval, no source, no expansion of what the file says --------------------------------------------
REQUIRED_KEYS=(
  BOOTSTRAP_TIMEZONE
  BOOTSTRAP_ORGANIZATION_NAME
  BOOTSTRAP_DEPARTMENT_CODE
  BOOTSTRAP_DEPARTMENT_NAME
  BOOTSTRAP_ADMIN_CODE
  BOOTSTRAP_ADMIN_NAME
  BOOTSTRAP_ADMIN_EMAIL
  BOOTSTRAP_ADMIN_HIRE_DATE
  BOOTSTRAP_OPERATOR_REFERENCE
  BOOTSTRAP_ADMIN_PASSWORD
)
OPTIONAL_KEYS=(BOOTSTRAP_CURRENCY BOOTSTRAP_LOGIN_EMAIL BOOTSTRAP_ADMIN_TYPE)
declare -A CFG=()
carriage_return=$'\r'
line_number=0
while IFS= read -r line || [ -n "$line" ]; do
  line_number=$((line_number + 1))
  # Checked on every line, before a CR-only line can pass as blank: `read` keeps the CR, a command substitution may not.
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

# --- The deployed image: exactly the one the last deployment recorded, never `latest` or an inherited value --------------
IMAGE_FILE="$APP_DIR/releases/current-image"
[ -f "$IMAGE_FILE" ] && [ ! -L "$IMAGE_FILE" ] ||
  refuse "$IMAGE_FILE not found: it names the image of the deployed release (a deployment writes it)"
IMAGE=''
image_lines=0
# `read`, not `$(< file)`: the line is checked exactly as written (a CR or a space is not quietly dropped).
while IFS= read -r image_line || [ -n "$image_line" ]; do
  image_lines=$((image_lines + 1))
  if [ "$image_lines" -eq 1 ]; then IMAGE="$image_line"; fi
done < "$IMAGE_FILE"
[ "$image_lines" -ge 1 ] || refuse "$IMAGE_FILE is empty"
[ "$image_lines" -eq 1 ] || refuse "$IMAGE_FILE must hold exactly one line, the image"
IMAGE_PATTERN='^[a-z0-9][a-z0-9./_-]*:[0-9a-f]{7,40}$'
[[ "$IMAGE" =~ $IMAGE_PATTERN ]] || refuse "$IMAGE_FILE must name an immutable image <name>:<commit sha>, never a moving tag"

# The one way this script talks to Docker: `run` of the api service (runtime role) of the live Compose file, in the image
# chosen above. API_IMAGE is set for this command only. The container is removed afterwards (--rm); no dependency is started.
compose_run() {
  API_IMAGE="$IMAGE" docker compose --project-directory "$APP_DIR" -f "$COMPOSE_FILE_PATH" \
    run --rm --no-deps -T api node dist/installation-cli.js "$@"
}

# An image built before the stdin mode would, if given the password, wait at its hidden prompt for a terminal it does not have
# or refuse the option; either way it is the wrong image. Ask it first, with nothing on its standard input.
help_status=0
help_text="$(compose_run --help < /dev/null)" || help_status=$?
[ "$help_status" -eq 0 ] ||
  refuse "'installation-cli.js --help' of $IMAGE failed (exit $help_status), so the image could not be checked and no password was sent"
case "$help_text" in
  *--password-stdin*) ;;
  *) refuse "the deployed image $IMAGE has no --password-stdin mode; build and deploy an image that contains it, then run this again (nothing was sent)" ;;
esac

# --- Run: every setting is one `--name=value` token, so a value can never be read as an option ------------------------
args=(--password-stdin "--timezone=${CFG[BOOTSTRAP_TIMEZONE]}")
[ -z "${CFG[BOOTSTRAP_CURRENCY]-}" ] || args+=("--currency=${CFG[BOOTSTRAP_CURRENCY]}")
args+=(
  "--organization-name=${CFG[BOOTSTRAP_ORGANIZATION_NAME]}"
  "--department-code=${CFG[BOOTSTRAP_DEPARTMENT_CODE]}"
  "--department-name=${CFG[BOOTSTRAP_DEPARTMENT_NAME]}"
  "--admin-code=${CFG[BOOTSTRAP_ADMIN_CODE]}"
  "--admin-name=${CFG[BOOTSTRAP_ADMIN_NAME]}"
  "--admin-email=${CFG[BOOTSTRAP_ADMIN_EMAIL]}"
  "--admin-hire-date=${CFG[BOOTSTRAP_ADMIN_HIRE_DATE]}"
)
[ -z "${CFG[BOOTSTRAP_ADMIN_TYPE]-}" ] || args+=("--admin-type=${CFG[BOOTSTRAP_ADMIN_TYPE]}")
[ -z "${CFG[BOOTSTRAP_LOGIN_EMAIL]-}" ] || args+=("--login-email=${CFG[BOOTSTRAP_LOGIN_EMAIL]}")
args+=("--operator-reference=${CFG[BOOTSTRAP_OPERATOR_REFERENCE]}" --environment=SHARED)

echo "Running the installation command of $IMAGE (settings and password from $CONFIG)."
install_status=0
set +e
# The password goes through a pipe from a builtin: it is in no process's argument list, no environment and no file.
builtin printf '%s\n' "${CFG[BOOTSTRAP_ADMIN_PASSWORD]}" 2> /dev/null | compose_run "${args[@]}"
install_status="${PIPESTATUS[1]}"
set -e
unset CFG

INSPECT="docker compose --project-directory $APP_DIR -f $COMPOSE_FILE_PATH run --rm --no-deps migrate node dist/inspect-cli.js"
case "$install_status" in
  0)
    echo 'Installed: the organization, its first department and the Super Admin exist.'
    echo "Next, check it: API_IMAGE=$IMAGE $INSPECT   (exit 0 = installed and consistent)"
    echo "and: API_IMAGE=$IMAGE ${INSPECT%inspect-cli.js}migration-preflight-cli.js   (READY); then sign in as the Super Admin."
    echo "The Super Admin password is still in $CONFIG: keep it at mode 600, or remove the password line or the file when you no longer need it. This script never changes it."
    ;;
  2) echo 'Already installed: the installation command changed nothing. Inspect the existing installation; do not reset or overwrite it blindly.' ;;
  130) echo 'Cancelled.' >&2 ;;
  *)
    {
      echo "The installation command exited $install_status. That does not prove nothing was written: the failure can follow a lost reply to COMMIT."
      echo "Check the installation state before running this again: API_IMAGE=$IMAGE $INSPECT"
    } >&2
    ;;
esac
exit "$install_status"
