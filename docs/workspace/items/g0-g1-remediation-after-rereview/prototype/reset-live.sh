#!/bin/sh
# Recreates a live database for the remediation runners: drop, create, migrate deploy, bootstrap through a real PTY.
# Usage: IMAGE=<runtime image> ENV_FILE=<env file for the CLI container> sh reset-live.sh <workDir> <repoRoot>
#   <workDir>/secrets.env: RUN, ADPW, SAPW, LIVEDB (slm_live_rr*), PGPORT; <workDir>/pty, <workDir>/pty-secret as in the
#   re-review runner. Only touches the container labelled review=slm-g0g1-$RUN. Derived from the re-review reset-live.sh
#   (kept unchanged there); here the image and the CLI env file are parameters so the patched CLI can be exercised.
SC="$1"; REPO="$2"; . "$SC/secrets.env"; C=slm-rr-pg-$RUN; W=$(cygpath -w "$SC")
IMAGE="${IMAGE:?set IMAGE}"; ENV_FILE="${ENV_FILE:-$W\\live.env}"
case "$LIVEDB" in slm_live_rr*) ;; *) echo "refusing: unexpected db name"; exit 1;; esac
[ "$(docker inspect -f '{{index .Config.Labels "review"}}' $C 2>/dev/null)" = "slm-g0g1-$RUN" ] || { echo "refusing: container label"; exit 1; }
docker exec $C psql -U postgres -d postgres -qc "DROP DATABASE IF EXISTS $LIVEDB WITH (FORCE);" -c "CREATE DATABASE $LIVEDB OWNER rr_admin;" || exit 1
(cd "$REPO" && NODE_ENV=development DATABASE_URL="postgresql://rr_admin:$ADPW@127.0.0.1:$PGPORT/$LIVEDB" pnpm -s db:migrate:deploy >/dev/null 2>&1) || { echo migrate-failed; exit 1; }
MSYS_NO_PATHCONV=1 docker run --rm --label review=slm-g0g1-$RUN --network slm-rr-net-$RUN --env-file "$ENV_FILE" -e DATABASE_URL="postgresql://rr_admin:$ADPW@rrpg:5432/$LIVEDB" -v "$W\pty:/review:ro" -v "$W\pty-secret:/review-secret:ro" --entrypoint sh "$IMAGE" /review/run.sh success | grep -E 'exit=|password_in'
