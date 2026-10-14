#!/bin/sh
# Recreates the re-review live database: drop, create, migrate deploy, bootstrap through a real PTY.
# Usage: sh reset-live.sh <workDir> <repoRoot>. Only touches resources named for this re-review run.
SC="$1"; REPO="$2"; . "$SC/secrets.env"; C=slm-rr-pg-$RUN; W=$(cygpath -w "$SC")
case "$LIVEDB" in slm_live_rr*) ;; *) echo "refusing: unexpected db name"; exit 1;; esac
[ "$(docker inspect -f '{{index .Config.Labels "review"}}' $C 2>/dev/null)" = "slm-g0g1-$RUN" ] || { echo "refusing: container label"; exit 1; }
docker exec $C psql -U postgres -d postgres -qc "DROP DATABASE IF EXISTS $LIVEDB WITH (FORCE);" -c "CREATE DATABASE $LIVEDB OWNER rr_admin;" || exit 1
(cd "$REPO" && NODE_ENV=development DATABASE_URL="postgresql://rr_admin:$ADPW@127.0.0.1:$PGPORT/$LIVEDB" pnpm -s db:migrate:deploy >/dev/null 2>&1) || { echo migrate-failed; exit 1; }
MSYS_NO_PATHCONV=1 docker run --rm --label review=slm-g0g1-$RUN --network slm-rr-net-$RUN --env-file "$W\live.env" -e DATABASE_URL="postgresql://rr_admin:$ADPW@rrpg:5432/$LIVEDB" -v "$W\pty:/review:ro" -v "$W\pty-secret:/review-secret:ro" --entrypoint sh saas-sentry-be-rereview:a8ba88f /review/run.sh success | grep -E 'exit=|password_in'
