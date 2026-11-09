#!/usr/bin/env bash
# Linux container runner (primary target). Run from Git Bash on Windows (Docker Desktop) or any bash with docker.
#
# OWNERSHIP RULES (shared Docker host: other people's containers and volumes live there)
#  * Every invocation has a RUN_ID (env RUN_ID, default <timestamp>-<random>). Containers are named spike-<RUN_ID>-<what>
#    and labelled spike.run=<RUN_ID> + spike.owner=translation-runtime. Volumes created here carry the same labels.
#  * Containers are removed in an EXIT/INT/TERM trap, and only those this invocation started AND whose label
#    spike.run still equals RUN_ID. Nothing is ever removed by name pattern.
#  * `install` never overwrites: an existing volume is refused unless --reuse <vol> (read-only, nothing modified) or
#    --force-own <vol> (only for a volume labelled spike.owner=translation-runtime). Unlabelled volumes and the protected
#    `spike-runtime-deps` are never removed by this script, under any flag.
#  * test/bench need SPIKE_DEPS_VOLUME explicitly (no implicit default); it is mounted READ-ONLY and verified to hold
#    @huggingface/transformers@4.3.1 (version + pnpm-lock.yaml sha256 are printed) before every run.
#
#   ./run-linux.sh install                       # new volume spike-rt-deps-<RUN_ID> (network ON, root, pnpm@11.1.3, --ignore-scripts)
#   ./run-linux.sh install --reuse <volume>      # verify an existing volume read-only (e.g. spike-runtime-deps), print how to use it
#   ./run-linux.sh install --force-own <volume>  # rebuild a volume that carries our owner label
#   SPIKE_DEPS_VOLUME=<vol> ./run-linux.sh test                # node --test incl. real-model tests, offline container
#   SPIKE_DEPS_VOLUME=<vol> ./run-linux.sh bench <scenario>... # one container PER scenario (clean cgroup memory.peak)
#   ./run-linux.sh list                          # containers and volumes that carry our owner label
#   ./run-linux.sh rm-volume <vol>               # remove a volume that carries our owner label (never protected/unlabelled)
#
# Phase 2 containers: --network none, user node, --cpus=2 --memory=2g (swap = memory), models and the spike dir mounted
# read-only (the SPIKE dir, not only runtime/, because the worker imports ../quality/lib/generate-adapter.mjs), evidence
# dir read-write. Env: SPIKE_MODELS (host path of .models/translation), SPIKE_CPUS (2), SPIKE_MEM (2g), SPIKE_TIMEOUT_S
# (1500, per container), BENCH_* (see bench/run.mjs), DOCKER (docker binary, tests use a fake).
set -euo pipefail
export MSYS_NO_PATHCONV=1
HERE="$(cd "$(dirname "$0")" && pwd)"
SPIKE_ROOT="$(cd "$HERE/.." && pwd)"
win() { if command -v cygpath >/dev/null 2>&1; then cygpath -m "$1"; else echo "$1"; fi; }
DOCKER="${DOCKER:-docker}"
IMAGE="${SPIKE_IMAGE:-node:24-bookworm-slim}"
RUN_ID="${RUN_ID:-$(date +%Y%m%d-%H%M%S)-$RANDOM}"
OWNER_KEY="spike.owner"; OWNER_VAL="translation-runtime"
RUN_LABEL="spike.run=$RUN_ID"
PROTECTED_VOLUMES=" spike-runtime-deps "
MODELS="${SPIKE_MODELS:-$(cd "$HERE/../../../../../../.models/translation" 2>/dev/null && pwd || true)}"
CPUS="${SPIKE_CPUS:-2}"; MEM="${SPIKE_MEM:-2g}"
TIMEOUT_S="${SPIKE_TIMEOUT_S:-1500}"
WANT_TF="4.3.1"
STARTED=()

die() { echo "ERROR: $*" >&2; exit "${2:-1}"; }

cleanup() {
  local n lbl
  for n in ${STARTED[@]+"${STARTED[@]}"}; do
    lbl="$("$DOCKER" inspect -f '{{index .Config.Labels "spike.run"}}' "$n" 2>/dev/null || true)"
    if [ "$lbl" = "$RUN_ID" ]; then "$DOCKER" rm -f "$n" >/dev/null 2>&1 || true; fi
  done
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

vol_exists() { "$DOCKER" volume inspect "$1" >/dev/null 2>&1; }
vol_owner() { "$DOCKER" volume inspect -f '{{index .Labels "spike.owner"}}' "$1" 2>/dev/null || true; }
is_protected() { case "$PROTECTED_VOLUMES" in *" $1 "*) return 0;; *) return 1;; esac; }

# docker run with timeout; the container is registered for the label-checked cleanup. $1 = short name.
run_container() {
  local name="spike-$RUN_ID-$1"; shift
  STARTED+=("$name")
  local rc=0
  timeout "$TIMEOUT_S" "$DOCKER" run --rm --name "$name" --label "$RUN_LABEL" --label "$OWNER_KEY=$OWNER_VAL" "$@" || rc=$?
  if [ "$rc" = 124 ]; then echo "ERROR: container $name exceeded ${TIMEOUT_S}s; removing it" >&2; fi
  return "$rc"
}

# Read-only probe of a deps volume: prints VERSION=<transformers version> and LOCKSHA=<pnpm-lock.yaml sha256>.
verify_deps_volume() {
  local vol="$1" out ver sha
  vol_exists "$vol" || die "volume $vol does not exist" 3
  STARTED+=("spike-$RUN_ID-probe") # registered here: run_container below runs in a subshell
  out="$(run_container probe --network none --user node -v "$vol":/app:ro "$IMAGE" sh -c \
    'echo PROBE_DEPS >/dev/null; v=$(node -p "require(\"/app/node_modules/@huggingface/transformers/package.json\").version" 2>/dev/null || echo MISSING); echo "VERSION=$v"; echo "LOCKSHA=$(sha256sum /app/pnpm-lock.yaml 2>/dev/null | cut -d" " -f1)"')" || die "probe of volume $vol failed" 3
  echo "$out"
  ver="$(echo "$out" | sed -n 's/^VERSION=//p' | head -1)"
  sha="$(echo "$out" | sed -n 's/^LOCKSHA=//p' | head -1)"
  [ "$ver" = "$WANT_TF" ] || die "volume $vol holds @huggingface/transformers '$ver', expected $WANT_TF" 3
  [ -n "$sha" ] || die "volume $vol has no pnpm-lock.yaml" 3
}

cmd="${1:-}"; shift || true

case "$cmd" in
install)
  mode=new; target=""
  while [ $# -gt 0 ]; do
    case "$1" in
      --reuse) mode=reuse; target="${2:?--reuse needs a volume name}"; shift 2;;
      --force-own) mode=force; target="${2:?--force-own needs a volume name}"; shift 2;;
      *) die "unknown install option $1" 2;;
    esac
  done
  if [ "$mode" = reuse ]; then
    echo "reuse (read-only, nothing is modified): $target"
    verify_deps_volume "$target"
    echo "SPIKE_DEPS_VOLUME=$target"
    exit 0
  fi
  if [ "$mode" = force ]; then
    is_protected "$target" && die "volume $target is protected and is never removed by this script" 4
    vol_exists "$target" || die "volume $target does not exist" 4
    [ "$(vol_owner "$target")" = "$OWNER_VAL" ] || die "volume $target is not labelled $OWNER_KEY=$OWNER_VAL; refusing to remove it" 4
    "$DOCKER" volume rm "$target" >/dev/null
    vol="$target"
  else
    vol="${SPIKE_DEPS_VOLUME:-spike-rt-deps-$RUN_ID}"
    if vol_exists "$vol"; then die "volume $vol already exists; use --reuse $vol (read-only) or, for a volume this spike labelled, --force-own $vol" 3; fi
  fi
  "$DOCKER" volume create --label "$OWNER_KEY=$OWNER_VAL" --label "$RUN_LABEL" "$vol" >/dev/null
  run_container install -v "$vol":/app -v "$(win "$HERE/install")":/in:ro "$IMAGE" sh -ec '
    node -v; npm install -g pnpm@11.1.3 >/dev/null 2>&1; pnpm --version
    cp /in/package.json /in/pnpm-workspace.yaml /in/pnpm-lock.yaml /app/; cd /app
    pnpm install --prod --frozen-lockfile --ignore-scripts 2>&1 | tail -6
    ls node_modules/.pnpm | grep -E "sharp|onnxruntime|transformers"
    chown -R node:node /app'
  verify_deps_volume "$vol"
  echo "SPIKE_DEPS_VOLUME=$vol"
  ;;
test|bench)
  VOL="${SPIKE_DEPS_VOLUME:-}"
  [ -n "$VOL" ] || die "set SPIKE_DEPS_VOLUME (run './run-linux.sh install' or 'install --reuse <volume>' first); there is no implicit default" 2
  [ -n "$MODELS" ] || die "models dir not found; set SPIKE_MODELS" 2
  mkdir -p "$HERE/evidence"
  verify_deps_volume "$VOL"
  echo "RUN_ID=$RUN_ID resources: cpus=$CPUS memory=$MEM memory-swap=$MEM network=none user=node timeout=${TIMEOUT_S}s deps-volume=$VOL (ro) image=$IMAGE"
  COMMON=(--network none --user node --cpus="$CPUS" --memory="$MEM" --memory-swap="$MEM"
    -v "$VOL":/app:ro -v "$(win "$MODELS")":/models:ro -v "$(win "$SPIKE_ROOT")":/spike:ro)
  if [ "$cmd" = bench ]; then
    rc=0
    for s in "$@"; do
      echo "== container for scenario $s =="
      run_container "$s" "${COMMON[@]}" -v "$(win "$HERE/evidence")":/out \
        -e SPIKE_DEPS_DIR=/app -e SPIKE_MODELS_DIR=/models -e BENCH_OUT=/out -e BENCH_PROFILE="${BENCH_PROFILE:-linux}" \
        -e BENCH_JOBS="${BENCH_JOBS:-200}" -e BENCH_FAST="${BENCH_FAST:-0}" -e BENCH_LAT_CONC="${BENCH_LAT_CONC:-1,2}" -e BENCH_LAT_DIRS="${BENCH_LAT_DIRS:-vi-en,en-vi}" -e BENCH_INTRA="${BENCH_INTRA:-1}" \
        -e BENCH_CLOCK_COMPUTE_MS="${BENCH_CLOCK_COMPUTE_MS:-}" -e BENCH_SUFFIX="${BENCH_SUFFIX:-}" -e BENCH_RUN_ID="$RUN_ID" \
        "$IMAGE" node /spike/runtime/bench/run.mjs "$s" || rc=$?
    done
    exit "$rc"
  else
    run_container test "${COMMON[@]}" -e SPIKE_DEPS_DIR=/app -e SPIKE_MODELS_DIR=/models "$IMAGE" \
      sh -c 'cd /spike/runtime && SPIKE_REAL=1 node --test --test-timeout=120000 --test-reporter=spec "test/*.test.mjs"'
  fi
  ;;
list)
  echo "-- containers labelled $OWNER_KEY=$OWNER_VAL"
  "$DOCKER" ps -a --filter "label=$OWNER_KEY=$OWNER_VAL" --format '{{.Names}}  {{.Status}}  {{.Label "spike.run"}}' 2>/dev/null || true
  echo "-- volumes labelled $OWNER_KEY=$OWNER_VAL"
  "$DOCKER" volume ls --filter "label=$OWNER_KEY=$OWNER_VAL" --format '{{.Name}}' 2>/dev/null || true
  ;;
rm-volume)
  v="${1:?volume name}"
  is_protected "$v" && die "volume $v is protected" 4
  vol_exists "$v" || die "volume $v does not exist" 4
  [ "$(vol_owner "$v")" = "$OWNER_VAL" ] || die "volume $v is not labelled $OWNER_KEY=$OWNER_VAL; refusing" 4
  "$DOCKER" volume rm "$v" >/dev/null
  echo "removed $v"
  ;;
*) echo "usage: $0 install [--reuse V|--force-own V] | test | bench <scenario>... | list | rm-volume V"; exit 2 ;;
esac
