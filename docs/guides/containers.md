# Containers and migrations

`docker compose up -d --wait` starts local PostgreSQL only; that is all the API and the worker need. Redis and MinIO are
optional and start only under their named profiles (`--profile queue`, `--profile storage`), for trying the queue and
object storage the API mounts for contract files (the queue is not mounted, Owner decision E2 = A, H6.4). Ports bind to loopback.
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

| Identity                             | Variables (`.env` beside the Compose file)           | Used by                                                                                                                                              | Attributes and privileges                                                                                                                                                                                                 |
| ------------------------------------ | ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cluster superuser (bootstrap)        | `POSTGRES_USER`, `POSTGRES_PASSWORD`                 | the `postgres` container; `ops:db-roles provision` (service `db-admin`, profile `admin`); a restore                                                  | superuser created by the image; never the URL of the API, the worker or a deploy step                                                                                                                                     |
| Deploy role (default `slm_deploy`)   | `DATABASE_DEPLOY_USER`, `DATABASE_DEPLOY_PASSWORD`   | services `backup` (`pg_dump`) and `migrate` (preflight, `prisma migrate deploy`, `ops:db-roles reconcile`/`verify`, `ops:inspect`), profile `deploy` | `LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`, no membership; owns the database and every object of schema `public`                                                                               |
| Runtime role (default `slm_runtime`) | `DATABASE_RUNTIME_USER`, `DATABASE_RUNTIME_PASSWORD` | `api`, `worker`; `ops:bootstrap`, `ops:recover` through `run api`                                                                                    | same attributes; `CONNECT`, `USAGE` on `public`, `SELECT, INSERT, UPDATE, DELETE` on every application table except `_prisma_migrations` (none) and `audit_events` (`SELECT, INSERT`), `USAGE` on sequences; owns nothing |

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
- **Ready before success (H7-OPS-RV-04).** `up -d` exiting 0 is not a success. The script then waits at most 120 s
  (`--ready-timeout`), looking every 2 s (`--poll-interval`), for one look where each of `api`, `worker`, `caddy` has
  exactly one container, running and not restarting; `api` and `worker` run exactly `<IMAGE>:<SHA>`; Caddy mounts the live
  `Caddyfile` (the sha256 of `/etc/caddy/Caddyfile` in the container is the one on disk); and `/api/v1/health/ready`,
  called from inside the API container, answers 2xx. It then watches for 20 s (`--stability-window`): every look must
  find the same containers with the same restart count, still ready — a crash-looping worker or a container another
  deployment replaced fails here. The workflow uses these defaults; the options exist for a slow host and for tests.
- **Failure after the promotion began** — a rename, the recreation, the readiness or the record below: the script puts
  the previous release state back whole, recreates the previous containers when the new ones had been created (one
  attempt, at most 300 s, with the image of `releases/current-image`, or of the `api` container on a host deployed before
  that file existed), and checks the previous release exactly as above. It always exits 1 and prints two separate
  verdicts: `RESULT: release <sha> (attempt <id>) FAILED while <step>` and one of `RECOVERY: the previous release <image>
is ready`, `RECOVERY: FAILED — …` (the previous release does not answer ready, or its containers or files could not be
  brought back: finish by hand, below) or `RECOVERY: not possible — …` (no previous release on this host). No migration is
  rolled back: the database keeps them and the dump taken before them is the way back for the data.
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
through `$C run --rm api node dist/installation-cli.js` with a terminal.

**Rotate a password:** change `DATABASE_DEPLOY_PASSWORD` or `DATABASE_RUNTIME_PASSWORD` in `.env`, run step 5 again (it
sets both passwords, nothing else changes on a consistent database), then `up -d --force-recreate api worker`. The
superuser password is the image's own: change it with `ALTER ROLE` in the `postgres` container and in `.env` together.

**Roll back a ready release** (no migration is undone), in `<APP_DIR>`, from the exact attempt that made it live — never a
guess between attempts:

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
- **1:** the command failed (database unreachable, settings invalid); nothing was judged.

**The preflight is a read-only check, not a repair.** It changes nothing, and no command in this repository invents a
department or `Unit`, rewrites immutable placement or allocation history, or recreates a database (`P29-RV-01`).

Supported and blocked histories (each proven by `test/integration/unit-only-upgrade-history.integration-spec.ts`):

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
