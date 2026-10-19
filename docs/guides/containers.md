# Containers and migrations

`docker compose up -d --wait` starts local PostgreSQL only; that is all the API and the worker need. Redis and MinIO are
optional and start only under their named profiles (`--profile queue`, `--profile storage`), for trying the queue and
object-storage sources that are not mounted today (Owner decision E2 = A, H6.4). Ports bind to loopback.
Check for port conflicts before starting; do not stop unrelated services.
Create the configured MinIO bucket before using storage.

MinIO builds locally from the pinned official release because the old prebuilt image
cannot be pulled. The first build downloads Go dependencies and can take several minutes.
This is a local development service; review storage support/security separately for production.
[Official source-build instructions](https://github.com/minio/minio/releases/tag/RELEASE.2025-10-15T17-29-55Z).

For port conflicts set POSTGRES_PORT, REDIS_PORT, MINIO_PORT and MINIO_CONSOLE_PORT
in your shell/.env, and align DATABASE_URL/OBJECT_STORAGE_ENDPOINT with those host ports.
All variable names (application and Compose-only) are listed in [.env.example](../../.env.example), with the variables
production requires and how to generate secrets; it carries no values and is not a production configuration.

Dockerfile builds the generated Prisma client in Linux, installs dependencies from
the lockfile and runs the final image as the node user. Secrets, local node_modules
and generated output are excluded from the build context.

```sh
docker build -t slm-api:foundation .
docker build --target migrate -t slm-migrate:foundation .
```

The runtime defaults to production. Supply DATABASE_URL and HTTPS CORS_ORIGINS.
Redis and object storage are not required: neither module is mounted in the API or the worker. A slice that mounts one
gets its production validation back (REDIS_HOST/REDIS_PASSWORD, or an HTTPS OBJECT_STORAGE_ENDPOINT with
credentials/bucket; the variables marked `@production-required-when-mounted` in `.env.example`).
Authentication also requires AUTH_ACCESS_TOKEN_SECRET and AUTH_THROTTLE_PEPPER;
invitation delivery requires HTTPS APP_PUBLIC_URL, OUTBOX_PAYLOAD_KEY (base64 of 32 bytes),
OUTBOX_PAYLOAD_KEY_ID, SMTP_HOST, SMTP_FROM and SMTP_TLS=true, plus the provider's port/auth settings.
The [environment validator](../../src/infrastructure/config/env-schema.ts) owns the full constraints, and refuses in
production (and in development) any of those four secrets whose value is public in the repository.
The API and the worker validate all of these settings and refuse to start in production without them.
The runtime image also carries `src/infrastructure/config/database-url.ts`, the one `DATABASE_URL` rule that both the
validator and `prisma.config.ts` read, so `prisma` commands in the image resolve the same URL.
The installation command validates only the database settings and NODE_ENV (see below).
Use container-reachable hostnames: localhost means the container itself.

Create untracked environment files appropriate to the target environment:

```sh
docker run --rm --env-file .env.migration slm-migrate:foundation
docker run --rm --env-file .env.container -p 127.0.0.1:3000:3000 slm-api:foundation
```

The migration image requires DATABASE_URL with migration privileges. The runtime
does not run migrations automatically. The baseline is for a fresh database;
existing databases need a separately reviewed transition, never an automatic reset.
First-run installation (once, on an empty database after migrations) is an interactive command in the
same runtime image: `docker run --rm -it --env-file .env.container slm-api:foundation node dist/installation-cli.js --help`.
The command validates only `NODE_ENV` (the image sets it to production), `DATABASE_URL` (the runtime role)
and the optional `DB_*` limits; it does not read the JWT, SMTP, outbox, Redis, object-storage or `APP_PUBLIC_URL`
settings, so `docker run --rm -it -e DATABASE_URL=... slm-api:foundation node dist/installation-cli.js ...` is enough.
`--help` and argument errors do not touch the environment at all. Passing the full env file still works;
unrelated variables are ignored. Exit code 1 does not prove that nothing was written: if the connection or the
reply to `COMMIT` was lost, check the installation state before running it again (a rerun that exits 2 means the
first run committed).
It needs a terminal (`-it`) because the Super Admin password is typed at a hidden prompt; it refuses to
read it from arguments, the environment or a pipe. The consolidated
[G0/G1 review](../reviews/g0-g1-remediation-2026-10-15/README.md) records the Linux PTY verification
through the remediation revision; manual interactive PowerShell verification is still pending.
The worker uses the same runtime image with command `node dist/worker.js` and runs the PostgreSQL
outbox polling loop for SMTP delivery. It mounts no queue and registers no BullMQ processor; the production Compose
file has no Redis service. A host that ran an earlier deploy keeps its `slm-redis` container (Compose only warns about
an orphan; the deploy does not pass `--remove-orphans`) and its volume: remove them by hand when no longer wanted. Compose has no SMTP sink;
configure a reachable SMTP service separately. SMTP TLS/provider delivery remains unverified.

For a local container smoke test, explicitly set NODE_ENV=development, database and
service hostnames and your own development secrets (no public default exists outside NODE_ENV=test);
do not expose development credentials to a shared environment.
Health live checks the HTTP process; ready pings PostgreSQL only and answers 503 `SERVICE_UNAVAILABLE` when it fails.
Behind PgBouncer or a managed pooler the connection startup parameters `options` and
`idle_in_transaction_session_timeout` need attention: see the pooler note in
[ARCHITECTURE](../../ARCHITECTURE.md) (not verified with any pooler).

References: [pnpm Docker](https://pnpm.io/docker),
[Prisma Docker](https://docs.prisma.io/docs/guides/deployment/docker).
