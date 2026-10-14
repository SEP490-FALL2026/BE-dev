#!/bin/sh
# Recreates the review-owned live database: drop, create, migrate deploy, bootstrap through a real PTY.
SC="$1"; REPO="$2"; . "$SC/secrets.env"; C=slm-review-pg17-$RUN; W=$(cygpath -w "$SC")
case "$LIVEDB" in slm_live_r*) ;; *) echo "refusing: unexpected db name"; exit 1;; esac
docker exec $C psql -U pgowner -d postgres -qc "DROP DATABASE IF EXISTS $LIVEDB WITH (FORCE);" -c "CREATE DATABASE $LIVEDB OWNER review_admin;" || exit 1
(cd "$REPO" && NODE_ENV=development DATABASE_URL="postgresql://review_admin:$ADPW@127.0.0.1:$PGPORT/$LIVEDB" pnpm -s db:migrate:deploy >/dev/null 2>&1) || { echo migrate-failed; exit 1; }
MSYS_NO_PATHCONV=1 docker run --rm --network slm-review-net-$RUN --env-file "$W\live.env" -e DATABASE_URL="postgresql://review_admin:$ADPW@reviewpg:5432/$LIVEDB" -v "$W\pty:/review:ro" -v "$W\pty-secret:/review-secret:ro" --entrypoint sh saas-sentry-be-review:64073c4 /review/run.sh success | grep -E 'exit=|password_in'
