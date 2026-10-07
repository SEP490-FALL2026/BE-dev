# Containers and migrations

Compose provides local PostgreSQL, Redis and MinIO. Ports bind to loopback.
Check for port conflicts before starting; do not stop unrelated services.
Create the configured MinIO bucket before using storage.

MinIO builds locally from the pinned official release because the old prebuilt image
cannot be pulled. The first build downloads Go dependencies and can take several minutes.
This is a local development service; review storage support/security separately for production.
[Official source-build instructions](https://github.com/minio/minio/releases/tag/RELEASE.2025-10-15T17-29-55Z).

For port conflicts set POSTGRES_PORT, REDIS_PORT, MINIO_PORT and MINIO_CONSOLE_PORT
in your shell/.env, and align DATABASE_URL/OBJECT_STORAGE_ENDPOINT with those host ports.

Dockerfile builds the generated Prisma client in Linux, installs dependencies from
the lockfile and runs the final image as the node user. Secrets, local node_modules
and generated output are excluded from the build context.

```sh
docker build -t slm-api:foundation .
docker build --target migrate -t slm-migrate:foundation .
```

The runtime defaults to production. Supply DATABASE_URL, HTTPS CORS_ORIGINS,
REDIS_HOST/REDIS_PASSWORD, HTTPS OBJECT_STORAGE_ENDPOINT and storage credentials/bucket.
Use container-reachable hostnames: localhost means the container itself.

Create untracked environment files appropriate to the target environment:

```sh
docker run --rm --env-file .env.migration slm-migrate:foundation
docker run --rm --env-file .env.container -p 127.0.0.1:3000:3000 slm-api:foundation
```

The migration image requires DATABASE_URL with migration privileges. The runtime
does not run migrations automatically. The baseline is for a fresh database;
existing databases need a separately reviewed transition, never an automatic reset.
The worker uses the same runtime image with command node dist/worker.js. No business
processor exists yet.

For a local container smoke test, explicitly set NODE_ENV=development, database and
service hostnames; do not expose development credentials to a shared environment.
Health live checks the HTTP process; ready pings PostgreSQL only.

References: [pnpm Docker](https://pnpm.io/docker),
[Prisma Docker](https://docs.prisma.io/docs/guides/deployment/docker).
