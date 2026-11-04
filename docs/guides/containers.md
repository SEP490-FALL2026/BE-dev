# Containers and migrations

`docker compose up -d --wait` starts local PostgreSQL only; that is all the API and the worker need. Redis and MinIO are
optional and start only under their named profiles (`--profile queue`, `--profile storage`), for trying the queue and
object storage the API mounts for contract files. The queue is standby infrastructure with no consumer yet (kept by the Owner,
OD-R5; not mounted, E2 = A, H6.4). Ports bind to loopback.
Check for port conflicts before starting; do not stop unrelated services.
Create the configured MinIO bucket before using storage. The API refuses the public default credentials of MinIO
(`minioadmin`) in every environment but `NODE_ENV=test` (SEC-04): set your own `MINIO_ROOT_USER`/`MINIO_ROOT_PASSWORD`
in your shell or `.env` and the same values as `OBJECT_STORAGE_ACCESS_KEY_ID`/`OBJECT_STORAGE_SECRET_ACCESS_KEY`
(different from each other). The `storage` profile of `compose.yaml` reads them and MinIO refuses to start when they are
missing, are `minioadmin` or are equal (P28-08); the default profile needs none of them.

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

**What the runtime image carries (OD-R9, Task 2.7 of the readability hardening).** The `runtime` stage copies `node_modules`
from the `production-dependencies` stage (`pnpm install --prod --frozen-lockfile`), not from the `build` stage, so the image
holds the production dependencies only: no `jest`, `eslint`, `ts-jest`, `@nestjs/cli`, `prettier` or `@types/*`. What the image
runs stays in `dependencies`: `prisma` (the CLI behind `node node_modules/prisma/build/index.js migrate deploy`, which the
`migrate` service of `docker-compose.prod.yml` runs in this same image; its `prisma.config.ts` needs `dotenv` and
`prisma/config`), `@prisma/client`, `@prisma/adapter-pg`, `@node-rs/argon2`, and `bullmq` with `@nestjs/bullmq` (standby
queue infrastructure kept by the Owner, OD-R5). Install scripts are not disabled in that stage: pnpm 11 runs only the build
scripts `allowBuilds` in `pnpm-workspace.yaml` allows (`@prisma/engines`, which downloads the schema engine that
`migrate deploy` needs, and `prisma`). `typescript` stays under `node_modules/.pnpm` only as a peer of `prisma` (not
resolvable from the application). Measured on 30/10/2026 (`docker build --target runtime`): `node_modules` 909 MB to 427 MB
(928 to 352 packages in `.pnpm`) and the image 1.58 GB to 939 MB (compressed 331 MB to 195 MB).
`test/gates/deployment-roles.gate-spec.ts` keeps this shape. To prove a change to it with the real image, build the
`runtime` stage and check: `node dist/cli.js --help` and every `dist/*-cli.js --help`; `require('bullmq')`,
`require('@nestjs/bullmq')`, `@node-rs/argon2` (hash and verify) and the generated client in `dist/generated/prisma` load;
`jest`, `eslint`, `typescript`, `ts-jest` do not resolve; `migrate deploy` and `ops:db-roles reconcile` pass against a
provisioned throwaway database; `node dist/main.js` (and `node dist/worker.js`) starts and `/api/v1/health/ready` answers 200.

```sh
docker build -t slm-api:foundation .
docker build --target migrate -t slm-migrate:foundation .
```

The runtime defaults to production. Supply DATABASE_URL and HTTPS CORS_ORIGINS.
Redis is not required today: the queue is standby infrastructure with no consumer yet, and it validates Redis only when a future
module mounts it. Object storage is mounted by the API (ADR-0014) and so needs an HTTPS
OBJECT_STORAGE_ENDPOINT with OBJECT_STORAGE_BUCKET and the access key (the variables marked
`@production-required-when-mounted` in `.env.example`); the worker and the commands do not read them. The endpoint is
the one the browser uploads to and the one signed links open: its host is written into every link, so it must be
reachable from the user's browser over HTTPS (not a container-internal name), the bucket must already exist, and the
storage must allow the browser's `PUT` from the application's origin (CORS, with the `Content-Type` header: the upload
link signs the declared type and size, ADR-0014). Where CORS is set depends on the storage: S3 and most services take a
**bucket** CORS rule; MinIO answers `NotImplemented` to `PutBucketCors` and takes CORS **server-wide** (its
`MINIO_API_CORS_ALLOW_ORIGIN` setting, every origin by default) — restrict it to the application's origin in any shared
deployment (P28-17). The signature still binds the type and size whatever CORS allows: a `PUT` with another
`Content-Type` or length is refused (403), as the real-storage integration suite shows. Links live 2 minutes to upload and
5 minutes to view. Add a lifecycle rule that expires the objects under `pending-documents/` after 2 days (what an upload
that was never completed leaves behind); objects under `documents/` are the kept files and are never expired by the
bucket. Completing a file copies the upload to `documents/`, records it, and only then deletes the upload; a commit that
fails takes its copy back (P28-11). The one case that can leave a copy under `documents/` with no row naming it is a
database that cannot even be read after that failure: compare `documents/` with `document_attachments.final_object_key`
before deleting anything there by hand.
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

The migration image requires DATABASE_URL of the **deploy role** (it owns the schema; see
[PostgreSQL roles](#postgresql-roles-h7)). The runtime does not run migrations automatically. The baseline is for a fresh
database; existing databases need a separately reviewed transition, never an automatic reset.
First-run installation (once, on an empty database after migrations) is an interactive command in the
same runtime image: `docker run --rm -it --env-file .env.container slm-api:foundation node dist/installation-cli.js --help`
(with the production Compose file: `docker compose -f docker-compose.prod.yml run --rm api node dist/installation-cli.js …`,
which gives it the runtime role).
The command validates only `NODE_ENV` (the image sets it to production), `DATABASE_URL` (the runtime role)
and the optional `DB_*` limits; it does not read the JWT, SMTP, outbox, Redis, object-storage or `APP_PUBLIC_URL`
settings, so `docker run --rm -it -e DATABASE_URL=... slm-api:foundation node dist/installation-cli.js ...` is enough.
`--help` and argument errors do not touch the environment at all. Passing the full env file still works;
unrelated variables are ignored. Exit code 1 does not prove that nothing was written: if the connection or the
reply to `COMMIT` was lost, check the installation state before running it again (a rerun that exits 2 means the
first run committed). Check the state without writing anything:
`docker run --rm -e DATABASE_URL=... slm-api:foundation node dist/inspect-cli.js`, in production
`docker compose -f docker-compose.prod.yml run --rm --no-deps migrate node dist/inspect-cli.js` (it reads
`_prisma_migrations`, which the runtime role may not; its sessions stay read-only) (`--json` for a machine; exit 0
installed and consistent, 2 not installed or incomplete, 1 error). It reads the database settings only and opens every
session read-only; it prints counts and the Super Admin email masked. The unified `seed` command and wrappers are documented in [seed](seed.md).
shared database ([operational commands](../rules/operational-commands.md)).
The installation command needs a terminal (`-it`) because the Super Admin password is typed at a hidden prompt; by default it
refuses to read it from arguments, the environment or a pipe. The one exception is the explicit switch `--password-stdin`
(Owner, 28/10/2026), used by the [bootstrap wrapper](#bootstrap-wrapper-prompt-06): it reads one bounded record from a pipe, never
an argument or an environment variable. The consolidated
[G0/G1 review](../reviews/g0-g1-remediation-2026-10-15/README.md) records the Linux PTY verification
through the remediation revision; manual interactive PowerShell verification is still pending.
The worker uses the same runtime image with command `node dist/worker.js` and runs the PostgreSQL
outbox polling loop for SMTP delivery. It mounts no queue and registers no BullMQ processor; the production Compose
file has no Redis service. A host that ran an earlier deploy keeps its `slm-redis` container (Compose only warns about
an orphan; the deploy never removes an orphan, H7-OPS-RV-03) and its volume: the Owner removes them by hand when no longer
wanted, by exact name (`docker stop slm-redis`, `docker rm slm-redis`, then `docker volume rm` with the volume name that
`docker inspect slm-redis` listed). Compose has no SMTP sink;
configure a reachable SMTP service separately. SMTP TLS/provider delivery remains unverified.

Request size: the API refuses a JSON or URL-encoded body over **100 KiB** with 413 `HTTP_PAYLOAD_TOO_LARGE` (one limit in
code, [API contract](../rules/api-contract.md#errors)); the two import uploads take a multipart file of at most 2 MiB. A
reverse proxy in front of the API must let at least 2 MiB plus the form through, or those uploads fail at the proxy
with its own answer instead of the API's. The URL-encoded parser stays mounted with at most 100 parameters and a nesting
depth of 5; malformed, unsupported (charset or `Content-Encoding`) or corrupt compressed bodies are 400/415, never 500.

## PostgreSQL roles (H7)

`F-15`, `DB-04`, Owner decision `Q9`; design and evidence:
[h7-postgresql-runtime-role-separation](../workspace/items/h7-postgresql-runtime-role-separation/spec.md). Production uses
three PostgreSQL identities; each process gets exactly one:

| Identity                             | Variables (`.env` beside the Compose file)           | Used by                                                                                                                                              | Attributes and privileges                                                                                                                                                                                                                    |
| ------------------------------------ | ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cluster superuser (bootstrap)        | `POSTGRES_USER`, `POSTGRES_PASSWORD`                 | the `postgres` container; `ops:db-roles provision` (service `db-admin`, profile `admin`); a restore                                                  | superuser created by the image; never the URL of the API, the worker or a deploy step                                                                                                                                                        |
| Deploy role (default `slm_deploy`)   | `DATABASE_DEPLOY_USER`, `DATABASE_DEPLOY_PASSWORD`   | services `backup` (`pg_dump`) and `migrate` (preflight, `prisma migrate deploy`, `ops:db-roles reconcile`/`verify`, `ops:inspect`), profile `deploy` | `LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`, no membership; owns the database and every object of schema `public`                                                                                                  |
| Runtime role (default `slm_runtime`) | `DATABASE_RUNTIME_USER`, `DATABASE_RUNTIME_PASSWORD` | `api`, `worker`; `ops:bootstrap`, `ops:recover` through `run api`                                                                                    | same attributes; `CONNECT`, `USAGE` on `public`, `SELECT, INSERT, UPDATE, DELETE` on every application table except `_prisma_migrations` (none) and `audit_events` (`SELECT, INSERT`), `USAGE` on sequences except two (below); owns nothing |

- **Two files.** `.env` feeds Compose interpolation only (the three identities, `DOMAIN`, `PORT`); a missing password stops
  every Compose command before it starts anything. `.env.app` holds the application settings (`.env.example` above the
  _Docker Compose only_ part) and **no** `POSTGRES_*`, `DATABASE_*` or `PG*` variable: it is the only file the API and the
  worker read, and their `DATABASE_URL` is built from the runtime role. Both files are `0600` and never committed.
- **Fail closed.** In production the API and the worker check their own login before any work starts and refuse a
  superuser, a role with `CREATEDB`/`CREATEROLE`/`REPLICATION`/`BYPASSRLS`, a member of another role, an owner of the
  database or of any object (the deploy role) and a session whose `session_replication_role` is not `origin`; their
  environment validation refuses `POSTGRES_PASSWORD`, `DATABASE_BOOTSTRAP_URL`, `DATABASE_DEPLOY_URL` and
  `DATABASE_DEPLOY_PASSWORD`. The deploy workflow refuses to start without `.env.app`, with a database variable in it,
  with a Compose file that does not interpolate, or with a candidate Caddyfile that Caddy refuses.
- **`pnpm ops:db-roles`** (`node dist/database-roles-cli.js`, `--help`): `provision` (as the superuser: create or correct
  both roles, give the database and every object of `public` to the deploy role, grant, verify — one transaction),
  `reconcile` (as the deploy role after every migration: grant again — the history table and the Audit Trail exceptions —
  and verify), `verify` (read-only). Exit 0 done/consistent, 2 refused or inconsistent with nothing written (every finding
  named), 1 error. It refuses an existing role that has an elevated attribute, a membership or a setting instead of
  demoting it, sends passwords as SCRAM-SHA-256 verifiers and never prints a URL or a password. Default privileges of the
  deploy role give the runtime role DML on the tables of the next migration before `reconcile` runs.
- **Migrations** never name a role: they run as the deploy role and must also apply on the integration harness, which has
  none. A new table that needs other runtime privileges than plain DML (append-only like `audit_events`) is added to
  `RUNTIME_TABLE_EXCEPTIONS` in `src/infrastructure/database/database-role-judgement.ts` in the same change. A
  `SECURITY DEFINER` routine in `public` is reported by `reconcile`: it would run as the owner for the runtime role.
- **Two sequences hold more than `USAGE` (H7-SEQ).** The runtime role holds exactly `SELECT, UPDATE` on `personnel_notice_seq`
  (BM-09) and `saas_issue_seq` (BM-11), and `USAGE` on every other sequence and on future ones. Numbering a notice or a report
  reads the old sequence (`SELECT … FROM <sequence>`: `SELECT`) and lifts it with `setval` (`UPDATE`) so that the compatibility
  image never draws a number already issued; `UPDATE` also allows `nextval`, so `USAGE` is not granted there. Both `reconcile`
  and `verify` read the one policy `RUNTIME_SEQUENCE_EXCEPTIONS` (`database-role-judgement.ts`): a missing or an extra privilege is
  the finding `RUNTIME_SEQUENCE_PRIVILEGES`, and a manual `GRANT` is neither needed nor kept — the next `reconcile` takes back
  anything outside the policy. Between `migrate deploy` (which creates a sequence with the default `USAGE`) and `reconcile` the
  runtime role fails closed (`42501` on `POST /saas-issues` or `POST /personnel-notices`); the deploy script runs `reconcile` before it
  starts the new containers.

### Deploys after H7 (H7-OPS-02, H7-OPS-RV-01..07)

The deploy workflow has two modes. **publish-only** (manual, the default of _Run workflow_) builds and pushes
`ghcr.io/<owner>/<repo>:<full commit sha>` for exactly the selected commit and never connects to the VPS. **deploy**
(automatic after CI on `main`, or manual) pushes the same image, copies the candidate — `docker-compose.prod.yml`,
`Caddyfile`, `scripts/ops/deploy-release.sh` — to `<app dir>/releases/<sha>/` and runs that script with the immutable image
and the attempt id `<run id>-<run attempt>` of the job. The same script also runs by hand (step 7 below).

- **One deployment at a time on the host (H7-OPS-RV-07).** GitHub's `concurrency` (`production-deploy`) orders only the
  deploy jobs of the workflow; it knows nothing of a script started by hand on the host. So the script takes a lock
  itself: right after checking its arguments — before it reads any file of the host, claims an attempt or calls Docker —
  it opens `<APP_DIR>/releases/.deploy.lock` and takes a kernel `flock` on it **without waiting**, and keeps it until it
  exits, through the readiness check, the success marker and the recovery. An exit, an error, a signal or a lost SSH
  session releases it (the kernel does, once the script and the commands it started have ended): there is nothing to
  clean up. Meanwhile a second deployment — from the workflow or by hand, of any release or attempt — refuses with exit 2
  before any Docker call, claims no attempt and changes nothing; its message names the holder as the holder recorded
  itself (pid, release, attempt, start time). A workflow job refused this way fails and leaves `latest` alone: re-run it
  (a new attempt) once the other deployment has ended. The script also exits 2 when `flock` (util-linux, present on
  Debian and Ubuntu) is missing or the lock file is not a regular file it can open.
- **Is a deployment running?** `flock -n <APP_DIR>/releases/.deploy.lock true && echo free || echo held` (it holds the
  lock for an instant only; a deployment starting at that very instant is refused and can be run again).
  `head -n 1 <APP_DIR>/releases/.deploy.lock` shows what the last holder recorded — then `ps -p <pid>` — and proves nothing
  on its own. **Never delete the lock file:** that releases nothing, and the next deployment would lock a new file while
  the running one still holds the old one — two deployments at once.
- **Candidate first.** The script validates the candidate Compose file with the live `.env`/`.env.app`, then the candidate
  Caddyfile with Caddy itself (`caddy validate` in a one-off `caddy` container of the candidate Compose; the mount source
  is `CADDYFILE_PATH`, which the script points at `releases/<sha>/Caddyfile`, so the live file is neither read nor
  replaced; Caddy's output is discarded because it can carry environment values). Then it pulls, backs up, and runs
  preflight, migrate and `reconcile` from the candidate. A failure in any of these leaves the live release and the
  running containers as they were.
- **One attempt, its own evidence (H7-OPS-RV-05).** Every run names a new `--attempt <id>` (letters, digits, `-`, `_`):
  the workflow passes `<run id>-<run attempt>`, so a re-run is a new attempt; by hand, choose a new one each time (for
  example `h7-rollout-1`, then `h7-rollout-2`). Before any Docker command the script claims
  `releases/<sha>/attempts/<id>/` with one `mkdir` and refuses an id that already exists: an earlier attempt is never
  rewritten or deleted, even for the same commit.
- **One release state.** The live `docker-compose.prod.yml`, `Caddyfile` and `releases/current-image` (the image of the
  live release) change together. The script keeps the previous ones — and `releases/current-attempt`, when there is one —
  in `releases/<sha>/attempts/<id>/replaced/`, replaces each by one rename and recreates `api`, `worker`, `caddy`.
- **Sequential startup.** After backup, preflight, migrations, role reconciliation and promotion, the script stops the old
  worker, recreates only the API and waits for its real readiness endpoint. Only then does it recreate worker, followed
  by Caddy. Each Compose mutation is bounded at 120 s; `--no-deps` prevents an implicit restart of the ready API.
  From API creation, the API-only wait and first full ready look share `--ready-timeout` (300 s by default);
  staging does not silently double the readiness budget. Recovery starts a fresh budget for the previous release.
  A failure at any stage enters recovery. Recovery uses the same sequence after the data-compatibility check, so the
  previous API is also started before its worker. This reduces simultaneous startup demand; improvement must be measured
  on the VPS under comparable conditions. Worker processing pauses until the API is ready; this is a restart deployment,
  not a zero-downtime rollout.
- **Ready before success (H7-OPS-RV-04).** `up -d` exiting 0 is not a success. After all three startup steps, the script uses
  the remaining startup budget (`--ready-timeout`), looking every 2 s (`--poll-interval`), for one look where each of `api`, `worker`, `caddy` has
  exactly one container, running and not restarting; `api` and `worker` run exactly `<IMAGE>:<SHA>`; Caddy mounts the live
  `Caddyfile` (the sha256 of `/etc/caddy/Caddyfile` in the container is the one on disk); and `/api/v1/health/ready`,
  called from inside the API container, answers 2xx. It then watches for 20 s (`--stability-window`): every look must
  find the same containers with the same restart count, still ready. The API identity and restart count must also match
  the API-only startup check — a crash-looping worker or a container another
  deployment replaced fails here. The workflow uses these defaults; the options exist for a slow host and for tests.
- **Failure after the promotion began** — a rename, the recreation, the readiness or the record below: the script puts
  the previous release state back whole, recreates the previous containers when the new ones had been created (one
  attempt, with the staged startup limits above and the image of `releases/current-image`, or of the `api` container on a host deployed before
  that file existed), and checks the previous release exactly as above. It always exits 1 and prints two separate
  verdicts: `RESULT: release <sha> (attempt <id>) FAILED while <step>` and one of `RECOVERY: the previous release <image>
is ready`, `RECOVERY: FAILED — …` (the previous release does not answer ready, or its containers or files could not be
  brought back: finish by hand, below), `RECOVERY: REFUSED — …` (the previous image cannot read the data, below) or
  `RECOVERY: not possible — …` (no previous release on this host). No migration is rolled back: the database keeps them and
  the dump taken before them is the way back for the data.
- **The way back must read the data (P04-CPE-04).** A green readiness probe proves the database answers, not that an image
  reads its rows. Each runtime image declares in its label `io.github.baophipham.slm.data-reads` the data representations
  it reads that an older runtime cannot (Dockerfile, stage `runtime`); an image built before that label (the compatibility
  image `fba4dfe` and every older one) declares none. `ops:preflight --recovery-target "<labels>"`, run read-only from the
  candidate as the deploy role, counts the rows of each representation the database holds (today three:
  `access-request-null-cost-center`, a sent internal free Request with no Cost Center;
  `access-request-cancel-spending-approver-party`, a Request or a group line closed with cause `SPENDING_APPROVER_PARTY` and no
  closing employee; `access-request-step-qd93-waiting-reason`, a step that waits with `NO_DEPARTMENT_HEAD`, `NO_SPENDING_APPROVER`
  or `SPENDING_APPROVER_IS_PARTY`, values an image before `QĐ-93c` cannot read) and says `COMPATIBLE` (exit 0),
  `INCOMPATIBLE` (2) or `NO_HISTORY` (3: no migration ever ran here). The script judges the previous image twice:
  - **before `migrate deploy`:** an image that is not on the host (its labels cannot be read) or a database with no
    migration history while the host names a previous release (a reset database under an old release state) stops the
    deploy there, exit 1, nothing migrated — `docker pull` the image, or follow _fresh installation_ below. An image that
    already cannot read rows only prints a warning: the deploy goes on, because a fixed release is the way out;
  - **in the recovery**, after the failed release's `api` and `worker` are **stopped** (they write nothing more): only
    `COMPATIBLE` brings the previous image back. Any other verdict — rows the failed release wrote and the image cannot
    read, an image no longer on the host, a judgement that fails, or `api`/`worker` that cannot be stopped — prints
    `RECOVERY: REFUSED`, recreates nothing and exits 1. The previous release state files are back, `api` and `worker` stay
    stopped and **no image serves the API**: an outage the output names, never a success.
- **Way back refused.** Do not recreate the previous image by hand: it fails on the rows it cannot read. Deploy a fixed
  release (or the same one again, once the cause of its failure is fixed) with a new `--attempt`; its pre-migrate judgement
  warns that the previous image is no way back and goes on. Restoring the pre-migrate dump into a new database is the only
  way back to the older image, an operator decision that loses every write since the dump. One case stops a release that
  was healthy: it passed readiness and only the rename of `releases/current-attempt` failed (`FAILED while recording
releases/current-attempt`). If the recovery is then refused, fix the cause of the rename (disk, permissions) and deploy
  the same release again with a new `--attempt`.
- **What moves when.** `releases/current-image` moves at the promotion, before the recreation, and is put back by a
  failure. `releases/current-attempt`, the successful-attempt marker, holds `releases/<sha>/attempts/<id>` and moves only
  after the readiness check, in one rename: it names the attempt whose `replaced/` holds the release before the live one
  (deploying again the release already live keeps the attempt that made it live). If it cannot be written, the release
  counts as failed and is rolled back as above. **`latest`** moves last, in the workflow step after the script exited 0;
  neither mode tags it at build time, so a failed deployment leaves it on the last ready release.
- **An interrupted run** (SSH lost between the promotion and the end): `releases/current-image` names the new sha while
  `releases/current-attempt` does not start with `releases/<that sha>/`. First check the lock (above): `held` means the
  script or a command it started is still running — wait for it. Once `free`, nothing was verified: check the release
  (step 8) and roll back from the attempt the log named (`🧾 Attempt <id> of <sha>`), the newest directory under
  `releases/<sha>/attempts/`.
- **Cleanup is by hand and exact.** The deploy removes no image, volume, container (orphans included) or attempt directory.
  Older release images stay until removed by exact reference once no container uses them
  (`docker image rm <IMAGE>:<old SHA>`); the legacy `slm-redis` container and volume are described above.

Nothing the script prints carries a credential.

### Rollout on an existing installation (manual, once)

The deploy job runs automatically after CI on `main`: do these steps **before** merging H7 to `main`. Until they are done,
a deploy stops at its first check and changes nothing on the host. The host lock covers every run of `deploy-release.sh`
(step 7, and the workflow of the H7 commit), not the manual steps 1–6, and the deploy workflow of `main` is still the one
from before H7, which takes no lock: from step 1 to step 8, merge or push nothing to `main` and do not run the workflow
in mode `deploy`. Below, `<SHA>` is the full commit sha of the H7 commit,
`<IMAGE>` is `ghcr.io/<owner>/<repo>` in lowercase, and `<APP_DIR>` is the application directory (`/opt/slm/backend` by
default). Every command pins `<IMAGE>:<SHA>`; none uses `latest`.

0. **Publish the image** — on GitHub, _Actions → Backend CD → Run workflow_ on the branch holding `<SHA>`, mode
   `publish-only`. Check that `<IMAGE>:<SHA>` exists. On the host, note the image in service now for the rollback:
   `docker inspect slm-api --format '{{.Config.Image}}'`.
1. **Back up** while the old wiring still runs (with the old Compose file):
   `docker compose -f docker-compose.prod.yml exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom --no-owner --no-privileges' > <dump>`,
   then check it: `docker compose -f docker-compose.prod.yml exec -T postgres pg_restore --list < <dump> > /dev/null`.
2. **Split the environment.** Keep the old file as `.env.pre-h7` (`cp -p .env .env.pre-h7`, `chmod 600`). Move every
   application setting from `.env` to a new `.env.app` (`chmod 600`); keep in `.env` only `POSTGRES_USER`,
   `POSTGRES_PASSWORD`, `POSTGRES_DB`, `DOMAIN`, `PORT` and add `DATABASE_DEPLOY_USER`, `DATABASE_DEPLOY_PASSWORD`,
   `DATABASE_RUNTIME_USER`, `DATABASE_RUNTIME_PASSWORD` (two new passwords of 32+ characters, `openssl rand -hex 32`,
   different from each other and from `POSTGRES_PASSWORD`). Remove `DATABASE_URL` from both files. The running containers
   keep the environment they were created with; do not recreate them with the old Compose file from here on.
3. **Transfer and validate the candidate** from a checkout at `<SHA>` (the live files are not touched):
   `ssh <host> mkdir -p <APP_DIR>/releases/<SHA>/scripts/ops`, then
   `scp docker-compose.prod.yml Caddyfile <host>:<APP_DIR>/releases/<SHA>/` and
   `scp scripts/ops/deploy-release.sh <host>:<APP_DIR>/releases/<SHA>/scripts/ops/` (from a Windows checkout,
   `tr -d '\r'` the script first). On the host, in `<APP_DIR>`:
   `export API_IMAGE=<IMAGE>:<SHA>`,
   `C="env CADDYFILE_PATH=<APP_DIR>/releases/<SHA>/Caddyfile docker compose --project-directory <APP_DIR> -f <APP_DIR>/releases/<SHA>/docker-compose.prod.yml"`,
   `$C config --quiet` (must succeed with the new `.env`/`.env.app`),
   `$C run --rm --no-deps -T caddy caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile` (the candidate
   Caddyfile; must print `Valid configuration`), `$C pull api worker`.
4. **Stop** `api` and `worker`: `docker compose -f docker-compose.prod.yml stop api worker`. The service is down from here
   until step 7 recreates the containers; plan the window. Provisioning waits at most 10 s for each lock.
5. **Provision** as the cluster superuser: `$C run --rm --no-deps db-admin` → `ops:db-roles provision: DONE`, the number
   of objects whose owner moved to the deploy role, `findings: none`. Exit 2 lists what was refused; nothing was written.
6. **Verify** as the deploy role: `$C run --rm --no-deps migrate node dist/database-roles-cli.js verify` → `CONSISTENT`.
7. **Deploy** the release with the script the workflow runs, naming a new attempt id `<ATTEMPT>` (for example
   `h7-rollout-1`; a later try `h7-rollout-2`) and the environment kept in step 2:
   `bash <APP_DIR>/releases/<SHA>/scripts/ops/deploy-release.sh --app-dir <APP_DIR> --release <SHA> --image <IMAGE>:<SHA> --attempt <ATTEMPT> --first-rollout-env .env.pre-h7`.
   It validates the candidate Compose and Caddyfile, backs up as the deploy role, runs preflight, migrate and
   `reconcile`, promotes the candidate, recreates `api`, `worker`, `caddy` with the runtime role and succeeds only once
   they are ready and stable (see above). Use this command, not _Run workflow_ in mode `deploy`: the workflow never passes
   `--first-rollout-env`, so it could not put `.env.pre-h7` back. `--first-rollout-env` is for this first rollout only:
   the script refuses it once `releases/current-image` exists, and no later deployment passes it. Merging H7 to `main`
   afterwards deploys the merge commit with the workflow, without it. While step 7 runs it holds the host lock: a
   deployment started meanwhile exits 2. If step 7 itself exits 2 because another deployment holds the lock, nothing was
   changed and no attempt was claimed: wait until the lock is free, then run it again.
8. **Check**: the API and the worker logs say `Database role "slm_runtime" is a runtime role`;
   `docker exec slm-api node -e "fetch('http://127.0.0.1:3000/api/v1/health/ready').then(r=>{console.log(r.status);process.exit(r.ok?0:1)})"`
   prints `200`; a sign-in works; no log shows `RuntimeDatabaseRoleRefusedError`. `releases/current-attempt` holds
   `releases/<SHA>/attempts/<ATTEMPT>`.

**Recovery and rollback by hand** (the two failures below, _Roll back a ready release_) change the same files as the
script: do them holding the host lock in your shell — in `<APP_DIR>`,
`exec 9<> releases/.deploy.lock && flock -n 9 && echo 'lock held'` (it fails at once if a deployment is running: wait, then
try again) — and leave that shell when done, which releases it. A deployment started meanwhile exits 2.

**If step 7 fails before the promotion** (the script names the step and says _failed before the promotion_; the live files
are untouched and `.env` was **not** restored, because nothing live changed): `api`/`worker` are still stopped from step 4.
Either fix the cause and run step 7 again with a new `<ATTEMPT>`, or return to the old wiring by hand:
`cp -p .env.pre-h7 .env`, then `API_IMAGE=<image noted in step 0> docker compose -f docker-compose.prod.yml up -d api worker`.
The roles and owners provisioned in step 5 do not stop the old wiring (the superuser bypasses every privilege).

**Host timeline:** before recreating containers and at each readiness look, the script records timestamped Linux
`/proc` load, memory, CPU, swap/page and pressure counters in the private diagnostic directory's `host-timeline.txt`.
Compare counter deltas between samples to distinguish CPU/steal, swapping and I/O stalls. This bounded file (1 MiB)
is also retained on successful deploys for comparison. It uses no Docker call, background sampler or extra Node process.
On failure, a separate `host-failure.txt` retains the final sample even if the timeline's size cap was reached.
Missing counters or collection failures do not affect readiness. Remove old diagnostic directories after review.

**Startup phases:** API and worker write immediate JSON entries with `context=StartupTiming`, outside Nest's buffered
logger. `imports-loaded` measures wall time/CPU since the Node process started (including static imports); subsequent
entries report deltas for Nest creation, basic HTTP configuration, Swagger generation when enabled, application
initialization and listening. Worker reports `worker-ready` after its context initializes. Fields `elapsedMs`, `phaseMs`,
`cpuMs`, `phaseCpuMs` and `rssMiB` contain no environment values or URLs. Wall time much greater than CPU time suggests
waiting/scheduling and must be compared with host I/O/swap/CPU counters; it does not identify a dependency by itself.
The API/worker `*-startup.log` files retain these entries privately on success or failure (64 KiB per file, best effort,
last 2000 container log lines scanned). Swagger behavior is unchanged so the first comparison isolates startup order.

**Failure diagnostics:** after a recreation/readiness failure, before restoring files or stopping containers, the script
collects best-effort evidence in `<APP_DIR>/.deploy-diagnostics-<RELEASE>-<ATTEMPT>/` (outside `releases/`): host memory/swap, load, disk and
container stats, `vmstat` samples, processes (command names only), selected container state (including OOM, exit and restart counts), and the last 200 timestamped log
lines per API/worker/Caddy container. Each command has a timeout; each file is capped at 1 MiB. Collection failure does
not prevent recovery. The directory is `0700`, files `0600`; raw logs can contain sensitive application data, so only
the location is printed to Actions. Review on the VPS, redact before sharing, and remove the diagnostics after the
incident is resolved. No environment/configuration dump or automatic upload is performed. The readiness failure now
includes the probe exit code (`124` normally means the outer 15-second Docker exec/probe timeout expired, not a proven HTTP failure).
Container IDs found during readiness are cached so log capture can proceed when subsequent Compose listings fail;
recovery checks do not overwrite candidate IDs or host samples. The HTTP probe still uses the real endpoint, with unchanged
readiness and stability criteria. Evidence describes the
containers present at capture time, which may be mixed old/new after a partial recreation; use their image identifiers.

**If step 7 fails after the promotion began** (`RESULT: … FAILED while <step>`: a rename, the recreation, the readiness or
the marker): the script has put the old `docker-compose.prod.yml` and `Caddyfile` back and removed the
`releases/current-image` it wrote; kept the H7 `.env` beside it as `.env.h7-<ATTEMPT>` (`0600`, never under `releases/`);
put `.env.pre-h7` back as `.env` in one rename (`0600`) **before** recreating `api`, `worker`, `caddy` with the image the
old `api` container ran; and checked that old release like a new one. `RECOVERY: the previous release <image> is ready`:
the old wiring serves again. `RECOVERY: FAILED`: finish by hand — `cp -p .env.pre-h7 .env` if the output says `.env` was
not restored, then
`API_IMAGE=<image noted in step 0> docker compose -f docker-compose.prod.yml up -d --force-recreate api worker caddy` and
the check of step 8. The database keeps the migrations; the dump of step 7 is in `backups/postgres/`. To try again later:
`cp -p .env.h7-<ATTEMPT> .env` (the role passwords it holds are the provisioned ones), then step 7 with a new
`<ATTEMPT>`.

On a **fresh** installation: steps 0, 2 (write the files from `.env.example`) and 3, `$C up -d postgres`, step 5 (the
database is empty), step 7 without `--first-rollout-env` (there is no environment to go back to), then `ops:bootstrap`
through `$C run --rm api node dist/installation-cli.js` **with all required arguments** (see the bootstrap template under
Path B below) and a terminal, and
`$C run --rm --no-deps migrate node dist/inspect-cli.js` → exit 0 (installed and consistent). A deploy that answers ready
is **not** an installation: readiness only pings the database, and until `ops:bootstrap` ran there is no organization
(`ops:inspect` exits 2). A fresh installation has **no way back**: if step 7 fails after the promotion, the output says
`RECOVERY: not possible`, the installation stays failed, `releases/current-attempt` is not written and `latest` does not
move. **Fresh installation over an old release state** (the database was emptied on a host that ran a release before):
the deploy refuses before `migrate deploy` while `releases/current-image` (or the old `api` container) names an image,
because no release ever ran on the new database. Holding the host lock (above), stop `api`/`worker`
(`docker compose -f docker-compose.prod.yml stop api worker`) and move the old release state aside — never delete it:
`mkdir releases/archived-<UTC yyyyMMddTHHmmssZ>` then
`mv docker-compose.prod.yml Caddyfile releases/current-image releases/current-attempt releases/archived-<…>/` (each that
exists). Emptying the database itself is the Owner's decision on one named target, by the method the Owner approved; no
CI/CD step resets a database. The Owner-run demo seed wrappers are the explicit reset exception: local development/loopback checks or VPS SEED_ALLOW_RESET=true plus exact database confirmation and verified backup. See [seed and the one-time QD-95 rebuild runbook](seed.md).

**Rotate a password:** change `DATABASE_DEPLOY_PASSWORD` or `DATABASE_RUNTIME_PASSWORD` in `.env`, run step 5 again (it
sets both passwords, nothing else changes on a consistent database), then `up -d --force-recreate api worker`. The
superuser password is the image's own: change it with `ALTER ROLE` in the `postgres` container and in `.env` together.

**Roll back a ready release** (no migration is undone), in `<APP_DIR>`, from the exact attempt that made it live — never a
guess between attempts. **First judge the way back (P04-CPE-04)**, holding the host lock: the release that is live may
have written rows the previous image cannot read, at any time since it went live.

0. `docker compose -f docker-compose.prod.yml stop api worker` (the service is down from here: nothing more is written);
   `PREV="$(head -n 1 releases/<SHA>/attempts/<ATTEMPT>/replaced/current-image)"` (the attempt of step 1 below);
   `L="$(docker image inspect --format '{{json .Config.Labels}}' "$PREV")"`; then, with the live image, which reads its
   own rows:
   `API_IMAGE="$(head -n 1 releases/current-image)" docker compose -f docker-compose.prod.yml run --rm --no-deps migrate node dist/migration-preflight-cli.js --recovery-target "$L"`.
   Exit 0 `COMPATIBLE`: go on with step 1. Exit 2 `INCOMPATIBLE`: **do not roll back** — start the live release again
   (`API_IMAGE="$(head -n 1 releases/current-image)" docker compose -f docker-compose.prod.yml up -d api worker`) and fix
   forward (_Way back refused_ above). Exit 3 or 1: stop and investigate; nothing was judged as safe. The live image must
   be the final release or later (`fba4dfe` and older have no `--recovery-target`): a rollback from the compatibility
   release to `7c28e75` follows spec L.10/L.11 of `g0-g6-final-business-baseline-remediation` (only before the activation
   step).

1. `head -n 1 releases/current-attempt` prints `releases/<SHA>/attempts/<ATTEMPT>`; the way back is that directory's
   `replaced/`, and only it: `releases/<SHA>/attempts/<ATTEMPT>/replaced/`. (No `releases/current-attempt`, or one that
   does not start with the sha of `releases/current-image`: see _An interrupted run_ above.)
2. `cp -p releases/<SHA>/attempts/<ATTEMPT>/replaced/docker-compose.prod.yml releases/<SHA>/attempts/<ATTEMPT>/replaced/Caddyfile .`
3. `cp -p releases/<SHA>/attempts/<ATTEMPT>/replaced/current-image releases/current-image` when `replaced/` holds one,
   otherwise (it replaced a release from before H7) `rm -f releases/current-image`.
4. Last, since step 1 read it: `cp -p releases/<SHA>/attempts/<ATTEMPT>/replaced/current-attempt releases/current-attempt`
   when `replaced/` holds one, otherwise `rm -f releases/current-attempt`.
5. **Normal rollback after H7** (`releases/current-image` is back): keep `.env` and `.env.app` and recreate with the
   previous image,
   `API_IMAGE="$(head -n 1 releases/current-image)" docker compose -f docker-compose.prod.yml up -d --force-recreate api worker caddy`.
   **Rollback of the first H7 release to the wiring before H7** (step 3 removed `releases/current-image`): first
   `cp -p .env .env.h7` (keep the role passwords), then `cp -p .env.pre-h7 .env`, then
   `API_IMAGE=<image noted in step 0> docker compose -f docker-compose.prod.yml up -d --force-recreate api worker caddy`.
6. Check as in step 8. Attempt directories stay as they are.

The superuser bypasses every privilege, so the old wiring runs on the provisioned database; the roles and owners can stay. To remove them as well, as the superuser in the application database, one statement per role
and the runtime role first:
`REASSIGN OWNED BY slm_deploy TO <POSTGRES_USER>; DROP OWNED BY slm_runtime; DROP OWNED BY slm_deploy; DROP ROLE slm_runtime, slm_deploy;`
(`DROP OWNED BY slm_deploy, slm_runtime` in one statement fails on PostgreSQL 17: _could not find tuple for default
ACL_). `provision` can run again afterwards.

## Releasing the final business baseline (expand → assign → contract)

`g0-g6-final-business-baseline-remediation`, spec L.3, L.5, L.10, L.11. The final release makes a subscription's owning department
and a Cost Center's department required and drops the objects of the job-title catalogue, the standard toolset, the cost allocation
and the service-account move. `prisma migrate deploy` applies every pending migration in one pass, so the data an operator must
assign or link cannot be placed between two migrations of one deploy: it is placed between two **releases**.

1. **Previous release → compatibility release (additive only).** Before it is deployed, cancel every `PENDING` service-account move
   on the running release (`serviceAccountMoveCancel`, reason `Chuyển phòng tài khoản dịch vụ đã bỏ (QĐ-89c)`); `pnpm ops:preflight`
   is `BLOCKED` with `SERVICE_ACCOUNT_MOVE_PENDING` while one is left. The deploy follows the usual order (backup → preflight →
   `migrate deploy` → `ops:db-roles reconcile` → recreate `api`/`worker`). The compatibility release adds columns and tables and
   reads the new enum values but writes none of the final shapes.
2. **Operator actions on the compatibility release (no code deploy).**
   - Assign the owning department of every subscription from its approved purchase or contract basis:
     `pnpm ops:assign-subscription-owner --subscription <id> --department <code> --basis <reference> --operator <reference> --environment LOCAL_TEST|SHARED`.
     One subscription at a time; nothing is inferred and nothing is assigned in bulk.
   - Give every Cost Center its department: `pnpm ops:cost-center-direction activate …` (once, with the release evidence and the
     approver) and `pnpm ops:cost-center-direction link …` for each Cost Center.
   - `pnpm ops:preflight` is `READY` when the data is in place. A row the previous release wrote after that (a rollback or a recovery)
     is listed again by the next preflight and assigned like the others.
3. **Compatibility release → final release.** The final release is deployed only while the running image is the compatibility image
   **and** `ops:preflight` is `READY`. Its blockers, each naming ids only, are `SUBSCRIPTION_OWNER_UNASSIGNED`,
   `SUBSCRIPTION_OWNER_EXPANSION_REQUIRED`, `COST_CENTER_UNLINKED`, `COST_CENTER_LINK_MISMATCH`,
   `COST_CENTER_DIRECTION_NOT_ACTIVATED`, `COST_CENTER_DIRECTION_EXPANSION_REQUIRED`, `SUBSCRIPTION_OWNER_SCHEMA_PARTIAL`,
   `COST_CENTER_DIRECTION_SCHEMA_PARTIAL`, `MIGRATION_FAILED`, `SERVICE_ACCOUNT_MOVE_PENDING`,
   `PERSONNEL_NOTICE_RETIRED_KIND_PENDING`, `DEPARTMENT_TRANSFER_TITLE_ONLY_PENDING` and `BUDGET_PROPOSAL_LEGACY_RETURN_AMBIGUOUS`.
   Each destructive migration also begins with a block that raises before it writes anything when the same condition holds, so a
   preflight that was skipped still stops the deploy with the data untouched. Those migrations also take `ACCESS EXCLUSIVE` locks
   on `employee_placements`, `department_transfers` and `transfer_reviews` (a column added, filled and dropped) while the
   compatibility image still serves traffic: run `migrate deploy` in a quiet window and cap the wait with `lock_timeout` in the
   deploy session, so a statement of the running image that holds one of those tables and wants another fails fast instead of
   waiting in a circle; a migration that stops on the timeout leaves the image in place (H7) and is run again.
4. **A failed final deploy** is recovered by H7 to the previous image, the compatibility image, which is valid on the **schema** before
   and after every migration of the final release — but not on every **row** the final release writes (P04-CPE-04): it types the Cost
   Center of a sent Request as required, and the final release sends internal free Requests without one (F91, `QĐ-87g(2)`). So the
   compatibility image is the way back only while the database holds no such row: the deploy judges it before `migrate deploy` and
   again in the recovery, after stopping the final release's `api`/`worker` (_The way back must read the data_ above). Zero rows at the
   preflight does not settle it: a row the final release writes before its readiness fails makes the recovery `REFUSED`. Once the final
   release has served such a Request, a manual rollback to the compatibility image is refused the same way (_Roll back a ready release_,
   step 0) and the way out is a fixed release. The database is never restored by the deploy; restoring the pre-migrate backup into a new
   database is the manual rollback across the destructive boundary and only an operator's decision (there is no `down`, `DB-05`).
   Supported way back per phase: on `7c28e75`, none needed; on the compatibility release, `7c28e75` until the activation step (L.11);
   on the final release, the compatibility image while `ops:preflight --recovery-target` says `COMPATIBLE`, otherwise none (fix forward);
   on a later release, the final release (it declares `access-request-null-cost-center`) or any image whose label covers the rows held.
5. **A fresh or empty database** has nothing to assign: the preflight is `READY` and the whole chain is applied in one pass; it has no
   way back (_fresh installation_ above).
6. **After the deploy** run `pnpm ops:inspect`: it accepts the old and the new installation sets and reports
   `CHANGE_ANNOUNCEMENTS_MISSING` when a placement or head period that had already taken effect, by the calendar of its own
   organization, when the seeding migration ran has no announcement mark (the migration
   `…_change_announcements_zone_and_yearly_counters` writes the missing marks, so the finding is gone after the final deploy). The closure of an ended fiscal year (`BudgetYearEndSweeper`) runs in the API process every
   hour and may run on several instances: the second run finds nothing left to do (ADR-0018).

### Task 1.2b action 9 on a real server (two paths)

Action 9 records that **one named database** is ready to receive the final release. It is not a deploy of the final release and
it **seeds no demo data** (the demo dataset is a separate operator step: [seed](seed.md)). The Owner/operator runs it on the host, per database, and records the
evidence in the Task 1.2b template of the work item's plan; a local rehearsal or a CI run never counts as action 9, and nothing here
runs in CI/CD. Placeholders: `<APP_DIR>`, `<IMAGE>` (`ghcr.io/<owner>/<repo>` in lower case), `<COMPAT_SHA>` =
`fba4dfe0885f19e6a76a6e6e7e15d30223d124ab`, `<FINAL_SHA>` (the Owner's commit of the final release), `<ATTEMPT>`, `<REF>` (a
reference, never a secret). On the host, in `<APP_DIR>`: `export API_IMAGE="$(head -n 1 releases/current-image)"` and
`L="docker compose --project-directory <APP_DIR> -f <APP_DIR>/docker-compose.prod.yml"`. Read-only checks run in `migrate` (deploy
role); commands that write data run in `api` (runtime role), with `--environment SHARED` (operator and approver are different
references). Exit codes are those of each command's `--help`.

**Path A — keep a populated database** (the approved compatibility sequence, spec L.3, L.5, L.10, L.11):

| #   | Do (exact)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Evidence still needed                                                                                                                      |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| A1  | On the release running now (`7c28e75` or older), as an IT Admin: `GET /api/v1/service-account-moves`, then for each `PENDING` one `POST /api/v1/service-account-moves/{id}/cancellation` with `{ "reason": "Chuyển phòng tài khoản dịch vụ đã bỏ (QĐ-89c)" }`                                                                                                                                                                                                                                                                                 | running image; ids cancelled (or `none`)                                                                                                   |
| A2  | Owner pushes `<COMPAT_SHA>`; CI green; deploy it (workflow mode `deploy`; by hand only as runbook step 7)                                                                                                                                                                                                                                                                                                                                                                                                                                     | CI run id; attempt id; `Release … is live and ready`; `releases/current-image` = `<IMAGE>:<COMPAT_SHA>`; dump name, SHA-256 and host label |
| A3  | Once A2 is ready and its record carries the image: `$L run --rm --no-deps api node dist/cost-center-direction-cli.js activate --release-evidence "<ATTEMPT> <IMAGE>:<COMPAT_SHA>" --approved-by <release owner REF> --operator <REF> --environment SHARED`                                                                                                                                                                                                                                                                                    | exit 0 (2 = already activated); organization id                                                                                            |
| A4  | `$L run --rm --no-deps migrate node dist/migration-preflight-cli.js`                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | the blockers, ids only                                                                                                                     |
| A5  | Each `COST_CENTER_UNLINKED`: Finance names its department from an authoritative basis (none yet ⟹ the Super Admin creates the real department first, `departmentCreate`), then `$L run --rm --no-deps api node dist/cost-center-direction-cli.js link --cost-center <id> --department <code> --basis <REF> --approved-by <Finance REF> --operator <REF> --environment SHARED`                                                                                                                                                                 | per id: basis, exit                                                                                                                        |
| A6  | Each `SUBSCRIPTION_OWNER_UNASSIGNED`: `$L run --rm --no-deps api node dist/subscription-owner-assignment-cli.js --subscription <id> --department <code> --basis <purchase or contract REF> --operator <REF> --environment SHARED`                                                                                                                                                                                                                                                                                                             | per id: basis, exit                                                                                                                        |
| A7  | Each `PERSONNEL_NOTICE_RETIRED_KIND_PENDING`: `POST /api/v1/personnel-notices/{id}/rejection` `{ "reason": "Loại BM-09 đã bỏ (QĐ-87e, D-1)" }`; each `DEPARTMENT_TRANSFER_TITLE_ONLY_PENDING`: `POST /api/v1/department-transfers/{id}/cancellation` with `reason` `Điều chuyển chỉ đổi chức vụ đã bỏ (QĐ-87e, D-1)` and the `grounds` the running API asks for; `SERVICE_ACCOUNT_MOVE_PENDING`: roll back to `7c28e75` (only before A3), cancel, deploy A2 again; `BUDGET_PROPOSAL_LEGACY_RETURN_AMBIGUOUS`: Owner/operator by id (spec J.2) | per id: outcome                                                                                                                            |
| A8  | `$L run --rm --no-deps migrate node dist/migration-preflight-cli.js` while the compatibility image runs                                                                                                                                                                                                                                                                                                                                                                                                                                       | `Preflight: READY`, exit 0 — action 9 done for this database                                                                               |

Never bulk-default, never infer a department, never record an approval nobody gave. Each other populated database needs its own A1–A8.
Next, outside action 9: push `<FINAL_SHA>`, CI, deploy; record its `Way back:` line (`COMPATIBLE` expected before it serves a
Request), then `$L run --rm --no-deps migrate node dist/inspect-cli.js`.

**Path B — fresh installation on a disposable trial database** (an alternative: only once the Owner names the exact target and gives
written permission to discard its data):

| #   | Do (exact)                                                                                                                                                                                                                    | Evidence still needed                                                     |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| B1  | Owner decision: host, database, permission to discard (`<REF>`); a final dump of the old data first if the Owner wants one (protected location)                                                                               | references; dump SHA-256 or `none by decision <REF>`                      |
| B2  | Holding the host lock: stop `api`/`worker`, move the old release state aside (_fresh installation_ above); empty the database by the Owner-approved method                                                                    | archive directory name; method reference                                  |
| B3  | `.env`/`.env.app` as step 2 (new role passwords), candidate of `<FINAL_SHA>` as step 3, `$C up -d postgres`, step 5 (`provision`), step 6 (`verify` → `CONSISTENT`)                                                           | outputs                                                                   |
| B4  | Step 7 without `--first-rollout-env`                                                                                                                                                                                          | exit 0; `No previous release on this host`; preflight `READY`; attempt id |
| B5  | Run `installation-cli.js --help`, then the bootstrap template below with all required arguments (interactive terminal; hidden password prompt) — or the [bootstrap wrapper](#bootstrap-wrapper-prompt-06) from a private file | exit 0                                                                    |
| B6  | `$L run --rm --no-deps migrate node dist/inspect-cli.js` and `… migration-preflight-cli.js`                                                                                                                                   | exit 0 installed and consistent; `READY`                                  |
| —   | A1, A3, A5–A7: `not-applicable — fresh install`, written only after B4–B6 are evidenced (no old row exists; the final runtime never reads the activation record)                                                              | —                                                                         |

Path B deploys the final release directly and has **no way back**; a failure stays a failed installation. Emptying a database alone
never closes P04-CPE-04: once the final release serves an internal free Request without Cost Center there, no older image is its way
back either.

Bootstrap template (after B4 succeeds, in `<APP_DIR>`; replace every `<…>` with the agreed installation value). `--help` is read-only
and does not connect to the database. Invoking the command without the required arguments does not perform a valid installation.
Use the exact final image; type the password twice at the hidden terminal prompt, never as an option. The organization time zone
cannot be changed later. `SHARED` applies to this VPS installation, including a shared trial/demo server.

```sh
export API_IMAGE='<IMAGE>:<FINAL_SHA>'
docker compose -f docker-compose.prod.yml run --rm --no-deps api node dist/installation-cli.js --help
docker compose -f docker-compose.prod.yml run --rm --no-deps api node dist/installation-cli.js \
  --timezone Asia/Ho_Chi_Minh --currency VND \
  --organization-name '<organization name>' \
  --department-code '<first department code>' --department-name '<first department name>' \
  --admin-code '<Super Admin employee code>' --admin-name '<Super Admin full name>' \
  --admin-email '<Super Admin work email>' --admin-hire-date '<YYYY-MM-DD>' \
  --operator-reference '<installation approval reference>' --environment SHARED
```

Bootstrap creates the organization, its first department and Super Admin; it creates no demo workforce/dataset. Then run B6 through
the `migrate` service. Exit 2 (`already installed`) requires inspecting the existing installation; do not reset or overwrite it blindly.

### Bootstrap wrapper (Prompt 06)

The canonical operator guide is now [Bootstrap tổ chức và Super Admin trên VPS](bootstrap-installation.md).
It covers the VPS file layout, exact copy/config/run/check commands, private-file syntax, exit codes and later deployments.
This anchor stays for existing links; keep bootstrap instructions in that one guide instead of duplicating them here.

### The pre-migrate dump is a protected operational document

It holds personal data. It is never committed (nothing under any working tree), never uploaded as a public or shared CI artifact
(no `actions/upload-artifact`, no release attachment, no chat, issue or PR), and is kept only in the protected backup directory of
the deploy (`<APP_DIR>/backups/postgres/slm-pre-migrate-<UTC yyyyMMddTHHmmssZ>-<short sha>.dump`, directory `0700`, written with
`umask 077` by the deploy role, retained by `scripts/ops/postgres-backup-retention.sh`). Evidence of a release records only the
SHA-256, the UTC time, the revision (the BE SHA and the last migration applied before) and the **name and host label** of the
protected location, never a public URL or the content. A rehearsal keeps its dump outside every repository, readable by the person
running it only, and deletes it when the resources are cleaned up. `git ls-files '*.dump' '*.backup' '*.sql.gz'` stays empty.

## Releasing the removal of the approval roles and of the department projects (QĐ-93c, QĐ-93h phase 2)

Three migrations drop what earlier releases stopped using: `…_identity_drop_approval_role_holders` (the table, its trigger and
function, the `ApprovalRole` type; the Super Admin / department head exclusion stays), `…_requests_drop_project_label` (the column
`access_requests.project_label`) and `…_organization_drop_projects` (the tables `projects` and `project_departments` and the
`ProjectStatus` type). They cannot be undone (no `down`, `DB-05`).

- **Deploy condition.** The release that carries them (N+1) is deployed only while the running image is the release that no longer
  reads or writes those objects (N: the approval-role routes and the project routes and fields are gone) or a later one. An image
  older than N still reads them and fails on the schema N+1 leaves.
- **Way back.** The image N: it does not read the dropped objects, so its schema stays valid for it. `--recovery-target` does not
  check these objects, because no image that is a way back reads them.
- **Each migration refuses before it writes.** It raises `P0001` and names every row, so a deploy that was run without a look still
  stops with the data untouched: `…_identity_drop_approval_role_holders` for the three kinds above; `…_requests_drop_project_label`
  for a request that was sent and still carries a label (the label of a draft is not kept, and its copy in the draft JSON is
  removed); `…_organization_drop_projects` for any row of `projects` or `project_departments`. The Super Admin fixes or removes the
  rows in the running release, and the deploy is run again. Nothing is deleted by a migration.

## Backup before production migrations

`DB-05`, added 22/10/2026 by `delivery-gate-hardening`. The deploy (`scripts/ops/deploy-release.sh`, run by
`.github/workflows/deploy.yml` in mode `deploy`, H7-OPS-02) dumps the production database **before** `prisma migrate deploy`:

- waits for PostgreSQL (`pg_isready`, 60 s), then runs `pg_dump --format=custom --no-owner --no-privileges` in the
  one-off `backup` service (the server's own image) as the **deploy role** over TCP with SCRAM (H7: not the cluster
  superuser, never the runtime role); the credentials come from `.env` through Compose, none is passed on a command line
  or printed, and a wrong or missing deploy password stops the deploy here;
- writes `<APP_DIR>/backups/postgres/slm-pre-migrate-<UTC yyyyMMddTHHmmssZ>-<short sha>.dump` (directory `0700`,
  `umask 077`) through a `.partial` file, and keeps it only when it is non-empty and `pg_restore --list` reads it;
- stops the deploy (exit 1, partial file removed) when `pg_dump` fails, when the dump is empty or unreadable, or when
  PostgreSQL is not ready — no migration runs and the running containers are not recreated.

### Preflight before `migrate deploy` (P28-01)

After the backup and before `prisma migrate deploy`, the workflow runs the read-only `pnpm ops:preflight`
(`node dist/migration-preflight-cli.js` in the `migrate` service, as the deploy role) and stops the deploy on any exit
code but 0. It judges whether
the history can carry the database through `20261022120000_cost_centers_unit_only` — merged and already applied on the
test VPS, so kept byte for byte (`P29-MIGRATION=B-FORWARD`) — and the forward migration
`20261023100000_service_account_owner_on_recorded_day`, which moves every history to the rule of the application (a
service account belongs to its responsible person's department on the day it was recorded, `QĐ-86c`). Its session is
read-only (PostgreSQL refuses any write, `25006`). `--json` gives the same report as one object.

- **0, `READY`:** the deploy may run. The report lists the service accounts the forward migration will move (each move is
  written to the Audit Trail as `LICENSE_ASSIGNMENT.OWNER_CORRECTED`, actor `SYSTEM`) and, before the merged migration,
  the `COMPANY` Cost Centers it deletes for good — only the backup keeps them.
- **2, `BLOCKED`:** do not deploy; every blocked row is named and the deploy stops before `migrate deploy`, so the
  database stays exactly as it was. `MIGRATION_FAILED`: Prisma recorded a failed attempt (it rolled back; every later
  deploy is refused). `SERVICE_ACCOUNT_WITHOUT_DEPARTMENT_ON_START`, `SERVICE_ACCOUNT_WITHOUT_DEPARTMENT_ON_RECORDED_DAY`,
  `COST_ALLOCATION_NAMES_COMPANY`, `DEPARTMENT_CHARGED_TO_COMPANY`: the data cannot be carried without inventing HR or
  finance history. See _Supported and blocked histories_ below for what may happen next.
  `DIRECT_ROLES_HEAD_WITHOUT_ACCOUNT`, `DIRECT_ROLES_SPENDING_APPROVER_IS_HEAD`, `DIRECT_ROLES_SPENDING_APPROVER_HOLDS_ROLE`,
  `DIRECT_ROLES_SPENDING_APPROVER_WITHOUT_ACCOUNT` (`QĐ-93k(4)`, read only until `…_identity_direct_roles` is applied): the
  conversion of `MANAGER` and `SPENDING_APPROVER` to granted roles stops for a head without an account, and for a spending
  approver who heads a department, holds `SUPER_ADMIN`, `IT_ADMIN` or `FINANCE`, or has no account. Each row is named by
  employee code (and department or role). The Super Admin fixes them in the running release (give the head an account, end the
  double role, hand the role over) and runs the command again; a spending approver whose account is locked or not activated, or
  who is handing over, is carried over and blocks nothing.
- **1:** the command failed (database unreachable, settings invalid); nothing was judged.

**No conversion command for the removal of the fallback approver and the substitute (`QĐ-93c`).** The release that removes
the two roles goes onto a new VPS with an empty database, created by CI/CD and then seeded (Owner 03/11/2026), so there is no
fallback- or substitute-held step, no request of a spending approver and no old waiting reason to carry over: nothing runs
between `migrate` and the start of `api`, and `pnpm ops:approval-role-conversion` does not exist. Steps of the old rule would
only appear on a database that ran an older release. The code no longer reads or freezes them: the migration
`…_identity_drop_approval_role_holders` stops with `P0001` and lists every such row (a request of which the spending approver is a
party, a step on an old routing row or with an old waiting reason, a spend step held by somebody who never had the grant), and the
Super Admin puts them right in the running release before the deploy is run again (see _Releasing the removal of the approval
roles and of the department projects_).

**The preflight is a read-only check, not a repair.** It changes nothing, and no command in this repository invents a
department or `Unit`, rewrites immutable placement or allocation history, or recreates a database (`P29-RV-01`).

Supported and blocked histories (each proven by `test/integration/platform/unit-only-upgrade-history.integration-spec.ts`):

| History                                                                             | Path                                                                                                     |
| ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Fresh database                                                                      | supported: `migrate deploy` of every migration; preflight `READY`                                        |
| Already applied `20261022120000` with its original checksum (the known test VPS)    | supported: the forward migration `20261023100000` moves service accounts to the recorded day, with audit |
| Older database, not yet at `20261022120000`, preflight `READY`                      | supported: both migrations in order, same end state as the other histories                               |
| Older database, not yet at `20261022120000`, preflight `BLOCKED` (exit 2)           | **no automatic path**: kept byte and data unchanged; deploying to it is blocked                          |
| Already at `20261022120000`, a service account in no department on its recorded day | **no automatic path**: preflight `BLOCKED`; the forward migration, if forced, stops before it writes     |

A blocked database moves only through an explicit, per-database decision of the Owner:

- **Recreate** it only after the Owner separately confirms that **this exact** database is disposable (the backup above
  is still taken first).
- A database that is **not** disposable needs an authoritative row-by-row mapping decision (which department or `Unit`
  each blocked row belongs to, on which HR or finance basis) and a separately reviewed repair procedure. Neither exists
  yet; this package does not make one up.

This limitation does not block committing the checkpoint; it blocks deploying it to any database whose preflight exits 2.

Run it by hand on any database before upgrading it: `pnpm ops:preflight` from a checkout with `DATABASE_URL` set, or the
command above in the image. The deploy step was not exercised on the VPS in Prompt 29.

There are no down migrations. After a failed or wrong migration, either **roll forward** with a new reviewed migration
or **restore** the dump taken just before it. A restore is a manual, approved operation: stop `api` and `worker`, restore
into a new empty database (for example
`docker compose -f docker-compose.prod.yml exec -T postgres sh -c 'createdb -U "$POSTGRES_USER" slm_restore && pg_restore -U "$POSTGRES_USER" -d slm_restore --no-owner --exit-on-error' < <dump>`),
check `_prisma_migrations` and the data, then point `DATABASE_URL` at it or swap the databases, and start the image that
matches that schema. The restored objects belong to the superuser (`--no-owner`): run `ops:db-roles provision` against
the database that will serve before starting `api` and `worker`. Never restore over the live database in place.

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
