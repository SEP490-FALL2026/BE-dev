# Containers and migrations

`docker compose up -d --wait` starts local PostgreSQL only; that is all the API and the worker need. Redis and MinIO are
optional and start only under their named profiles (`--profile queue`, `--profile storage`), for trying the queue and
object storage the API mounts for contract files (the queue is not mounted, Owner decision E2 = A, H6.4). Ports bind to loopback.
Check for port conflicts before starting; do not stop unrelated services.
Create the configured MinIO bucket before using storage. The API refuses the public default credentials of MinIO
(`minioadmin`) in every environment but `NODE_ENV=test` (SEC-04): set your own `MINIO_ROOT_USER`/`MINIO_ROOT_PASSWORD`
and the same values as `OBJECT_STORAGE_ACCESS_KEY_ID`/`OBJECT_STORAGE_SECRET_ACCESS_KEY` (different from each other).

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
Redis is not required: the queue is not mounted. Object storage is mounted by the API (ADR-0014) and so needs an HTTPS
OBJECT_STORAGE_ENDPOINT with OBJECT_STORAGE_BUCKET and the access key (the variables marked
`@production-required-when-mounted` in `.env.example`); the worker and the commands do not read them. The endpoint is
the one the browser uploads to and the one signed links open: its host is written into every link, so it must be
reachable from the user's browser over HTTPS (not a container-internal name), the bucket must already exist, and the
bucket must allow the browser's `PUT` from the application's origin (CORS, with the `Content-Type` header: the upload link signs
the declared type and size, ADR-0014). Links live 2 minutes to upload and 5 minutes to view. Add a lifecycle rule that
expires the objects under `pending-documents/` after 2 days (what an upload that was never completed leaves behind);
objects under `documents/` are the kept files and are never expired by the bucket.
Authentication also requires AUTH_ACCESS_TOKEN_SECRET and AUTH_THROTTLE_PEPPER;
invitation delivery requires HTTPS APP_PUBLIC_URL, OUTBOX_PAYLOAD_KEY (base64 of 32 bytes), OUTBOX_PAYLOAD_KEY_ID,
SMTP_HOST, SMTP_FROM and SMTP_TLS=true, plus the provider's port/auth settings.
The license key vault requires LICENSE_KEY_VAULT_KEY (base64 of 32 bytes, never the same bytes as OUTBOX_PAYLOAD_KEY or
any previous key of either purpose, however written; standard padded base64 only, SEC-05),
LICENSE_KEY_VAULT_KEY_ID and LICENSE_KEY_FINGERPRINT_PEPPER; LICENSE_KEY_VAULT_PREVIOUS_KEYS (`id:base64` pairs) keeps
the keys of a rotation and is held to the same rules as the current key. How to rotate and what to back up:
[license key vault](license-key-vault.md).
The [environment validator](../../src/infrastructure/config/env-schema.ts) owns the full constraints, and refuses in
production (and in development) any secret value that is public in the repository (the five secrets above, a
previous vault key and the storage credentials).
The API and the worker validate all of these settings and refuse to start in production without them.
The runtime image also carries `src/infrastructure/config/database-url.ts`, the one `DATABASE_URL` rule that both the
validator and `prisma.config.ts` read, so `prisma` commands in the image resolve the same URL.
The installation command validates only the database settings and NODE_ENV (see below).
Use container-reachable hostnames: localhost means the container itself (the object storage endpoint is the exception: it must reach the browser).

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
first run committed). Check the state without writing anything:
`docker run --rm -e DATABASE_URL=... slm-api:foundation node dist/inspect-cli.js` (`--json` for a machine; exit 0
installed and consistent, 2 not installed or incomplete, 1 error). It reads the database settings only and opens every
session read-only; it prints counts and the Super Admin email masked. `dev-seed-cli.js` is in the image too, but it
refuses with exit 3 unless `NODE_ENV` is development or test and the database host is loopback: never point it at a
shared database ([operational commands](../rules/operational-commands.md)).
The installation command needs a terminal (`-it`) because the Super Admin password is typed at a hidden prompt; it refuses to
read it from arguments, the environment or a pipe. The consolidated
[G0/G1 review](../reviews/g0-g1-remediation-2026-10-15/README.md) records the Linux PTY verification
through the remediation revision; manual interactive PowerShell verification is still pending.
The worker uses the same runtime image with command `node dist/worker.js` and runs the PostgreSQL
outbox polling loop for SMTP delivery. It mounts no queue and registers no BullMQ processor; the production Compose
file has no Redis service. A host that ran an earlier deploy keeps its `slm-redis` container (Compose only warns about
an orphan; the deploy does not pass `--remove-orphans`) and its volume: remove them by hand when no longer wanted. Compose has no SMTP sink;
configure a reachable SMTP service separately. SMTP TLS/provider delivery remains unverified.

## Backup before production migrations

`DB-05`, added 22/10/2026 by `delivery-gate-hardening`. The deploy workflow (`.github/workflows/deploy.yml`, step 3.5)
dumps the production database **before** `prisma migrate deploy`:

- waits for PostgreSQL (`pg_isready`, 60 s), then runs `pg_dump --format=custom --no-owner --no-privileges` inside the
  `postgres` container over its local socket with that container's own `POSTGRES_USER`/`POSTGRES_DB`; no credential is
  passed on a command line or printed;
- writes `<APP_DIR>/backups/postgres/slm-pre-migrate-<UTC yyyyMMddTHHmmssZ>-<short sha>.dump` (directory `0700`,
  `umask 077`) through a `.partial` file, and keeps it only when it is non-empty and `pg_restore --list` reads it;
- stops the deploy (exit 1, partial file removed) when `pg_dump` fails, when the dump is empty or unreadable, or when
  PostgreSQL is not ready — no migration runs and the running containers are not recreated.

There are no down migrations. After a failed or wrong migration, either **roll forward** with a new reviewed migration
or **restore** the dump taken just before it. A restore is a manual, approved operation: stop `api` and `worker`, restore
into a new empty database (for example
`docker compose -f docker-compose.prod.yml exec -T postgres sh -c 'createdb -U "$POSTGRES_USER" slm_restore && pg_restore -U "$POSTGRES_USER" -d slm_restore --no-owner --exit-on-error' < <dump>`),
check `_prisma_migrations` and the data, then point `DATABASE_URL` at it or swap the databases, and start the image that
matches that schema. Never restore over the live database in place.

Retention (manual, bounded): the workflow never deletes a backup. `scripts/ops/postgres-backup-retention.sh` keeps the
10 newest `slm-pre-migrate-<stamp>-<sha>.dump` files **and** every file younger than 30 days (age from the UTC stamp in
the name) and deletes only older ones beyond those 10. It is a **dry run unless `--apply`**, refuses (exit 2) any
directory that is not an absolute `…/backups/postgres` path, and never touches another name, a symlink or a `.partial`
file. Run it from a checkout over SSH; `tr -d '\r'` keeps a Windows (CRLF) checkout runnable on the Linux host:

```bash
tr -d '\r' < scripts/ops/postgres-backup-retention.sh | ssh <vps> 'bash -s -- --dir /opt/slm/backend/backups/postgres'
# read the list, then the same command with --apply appended
```

A dump contains personal data; copy it off the host only to storage with the same access controls as the database.

Verification: the backup block was exercised locally on 22/10/2026 against a disposable PostgreSQL 17 container (success,
`pg_dump` failure and unreadable-dump cases; the success dump restored with 40 migrations and 58 tables). The retention
script has tests (`pnpm test:scripts`) and was run on a Linux container through stdin as above. Neither has run on the
VPS or in a real deploy.

## Local smoke test

For a local container smoke test, explicitly set NODE_ENV=development, database and
service hostnames and your own development secrets (no public default exists outside NODE_ENV=test);
do not expose development credentials to a shared environment.
Health live checks the HTTP process; ready pings PostgreSQL only and answers 503 `SERVICE_UNAVAILABLE` when it fails.
Behind PgBouncer or a managed pooler the connection startup parameters `options` and
`idle_in_transaction_session_timeout` need attention: see the pooler note in
[ARCHITECTURE](../../ARCHITECTURE.md) (not verified with any pooler).

References: [pnpm Docker](https://pnpm.io/docker),
[Prisma Docker](https://docs.prisma.io/docs/guides/deployment/docker).
