#!/usr/bin/env bash
# Linux container install + offline smoke (T-6). Run from Git Bash on Windows (Docker Desktop) or any bash with docker.
#
#   run-linux.sh <name> <project-dir-with-package.json+pnpm-lock.yaml+pnpm-workspace.yaml> <models-dir>
#
# Phase 1 (network allowed, root): same flags as the product Dockerfile
#   npm install -g pnpm@11.1.3 ; pnpm install --prod --frozen-lockfile --ignore-scripts
#   into a fresh docker volume (only the three package files + smoke.mjs are copied in; no node_modules from the host).
# Phase 2 (--network none, user node, models mounted read-only):
#   node smoke.mjs  -> evidence/<name>-smoke-linux.json
# Env: SPIKE_DOCKER_MEMORY (e.g. 1g) adds --memory to phase 2. SPIKE_KEEP_VOLUME=1 keeps the volume.
set -euo pipefail
export MSYS_NO_PATHCONV=1
NAME="$1"; PROJ="$2"; MODELS="$3"
IMAGE="${SPIKE_IMAGE:-node:24-bookworm-slim}"
HERE="$(cd "$(dirname "$0")" && pwd)"
win() { if command -v cygpath >/dev/null 2>&1; then cygpath -m "$1"; else echo "$1"; fi; }
VOL="spike-deps-$NAME"
EVID="$HERE/evidence"
mkdir -p "$EVID"

docker volume rm -f "$VOL" >/dev/null 2>&1 || true
docker volume create "$VOL" >/dev/null

echo "== phase 1: install (network on) =="
docker run --rm -v "$VOL":/app -v "$(win "$PROJ")":/in:ro -v "$(win "$HERE")":/spike:ro "$IMAGE" sh -ec '
  node -v
  npm install -g pnpm@11.1.3 >/dev/null 2>&1
  pnpm --version
  cp /in/package.json /in/pnpm-lock.yaml /in/pnpm-workspace.yaml /spike/smoke.mjs /app/
  cd /app
  rc=0
  pnpm install --prod --frozen-lockfile --ignore-scripts > /tmp/install.log 2>&1 || rc=$?
  tail -6 /tmp/install.log
  echo "install-exit=$rc"
  [ "$rc" = 0 ]
  echo "sizes-MB node_modules=$(du -sm /app/node_modules | cut -f1)"
  du -sm /app/node_modules/.pnpm/onnxruntime-node@* /app/node_modules/.pnpm/onnxruntime-web@* /app/node_modules/.pnpm/sharp@* /app/node_modules/.pnpm/@img+sharp-* /app/node_modules/.pnpm/@huggingface+transformers@* 2>/dev/null | sed "s#/app/node_modules/.pnpm/#sizes-MB #"
  chown -R node:node /app
' | tee "$EVID/.$NAME-linux-install.txt"

MEMARG=()
if [ -n "${SPIKE_DOCKER_MEMORY:-}" ]; then MEMARG=(--memory "$SPIKE_DOCKER_MEMORY" --memory-swap "$SPIKE_DOCKER_MEMORY"); fi

echo "== phase 2: offline smoke (--network none, user node) =="
set +e
docker run --rm --network none --user node "${MEMARG[@]}" \
  -v "$VOL":/app:ro -v "$(win "$MODELS")":/models:ro \
  -e SPIKE_MODELS_DIR=/models -e SPIKE_LABEL="$NAME-linux" -w /app "$IMAGE" \
  sh -c 'echo "uid=$(id -u) user=$(id -un) node=$(node -v)";
         node -e "fetch(\"https://huggingface.co/\").then(()=>console.log(\"NETWORK-REACHABLE\")).catch(e=>console.log(\"network probe failed as expected:\", e.cause&&e.cause.code||e.message))";
         node -e "const m=require(\"@huggingface/transformers\");console.log(\"cjs require ok\",typeof m.pipeline)";
         node smoke.mjs' > "$EVID/.$NAME-linux-run.txt" 2> "$EVID/.$NAME-linux-run.err"
RC=$?
set -e
echo "phase2 exit=$RC"
grep -v '^SPIKE_RESULT' "$EVID/.$NAME-linux-run.txt" || true
grep '^SPIKE_RESULT ' "$EVID/.$NAME-linux-run.txt" | sed 's/^SPIKE_RESULT //' > "$EVID/.$NAME-linux-smoke.raw.json" || true
node -e "
const fs=require('fs');const p=process.argv[1];
const t=fs.readFileSync(p,'utf8').trim();
if(!t){console.log('no result');process.exit(0)}
fs.writeFileSync(process.argv[2],JSON.stringify(JSON.parse(t),null,2)+'\n')" \
  "$(win "$EVID/.$NAME-linux-smoke.raw.json")" "$(win "$EVID/$NAME-smoke-linux${SPIKE_DOCKER_MEMORY:+-mem$SPIKE_DOCKER_MEMORY}.json")"
rm -f "$EVID/.$NAME-linux-smoke.raw.json"
mv "$EVID/.$NAME-linux-install.txt" "$EVID/$NAME-linux-install.txt"
grep -v '^SPIKE_RESULT' "$EVID/.$NAME-linux-run.txt" > "$EVID/$NAME-linux-run${SPIKE_DOCKER_MEMORY:+-mem$SPIKE_DOCKER_MEMORY}.txt" || true
mv "$EVID/.$NAME-linux-run.err" "$EVID/.err.tmp" && grep -v MarianTokenizer "$EVID/.err.tmp" | head -20 > "$EVID/$NAME-linux-run${SPIKE_DOCKER_MEMORY:+-mem$SPIKE_DOCKER_MEMORY}.stderr.txt" || true; rm -f "$EVID/.err.tmp" "$EVID/.$NAME-linux-run.txt"
if [ "${SPIKE_KEEP_VOLUME:-0}" != "1" ]; then docker volume rm "$VOL" >/dev/null || echo "WARN: volume $VOL not removed"; fi
exit $RC
