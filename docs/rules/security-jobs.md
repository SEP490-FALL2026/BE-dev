# Authentication, files and jobs

## Authentication and authorization

- Target: account/password + JWT. Login, password hashing, token issuance, refresh
  and account lifecycle are not implemented. Design them from the relevant US.
- Global Bearer guard denies access by default. Missing token returns 401; the
  placeholder refuses supplied tokens with 503 AUTHENTICATION_NOT_CONFIGURED.
  Never use an always-accept verifier outside isolated tests.
- Public routes need @Public() and anonymous HTTP tests. Catalog has no role/resource
  policy; add authorization from the US before opening real business access.
- Never trust client-supplied privileges. A signed JWT alone does not establish
  current account status or resource permission.
- Distinguish invalid credentials from unavailable dependencies. Do not log secrets.
- Rate limiting currently uses per-process memory. Redis is queue infrastructure.
- Configure TRUST_PROXY_HOPS only for trusted ingress that overwrites client headers.

## Storage and jobs

- Storage/BullMQ adapters exist; file APIs and business processors do not.
- Business modules call ObjectStoragePort rather than vendor SDKs.
- Check permissions before issuing short-lived signed URLs; objects remain private.
- Filenames, MIME, bytes, CSV/XLSX cells and queue payloads are untrusted input.
- Imports need limits, ownership/purpose checks and idempotency defined by the US.
- Retries must not duplicate business writes. PostgreSQL holds authoritative state;
  Redis/job IDs do not replace constraints or durable deduplication.
- Mocks do not prove real storage access, revocation or worker retry behavior.

[Architecture](../../ARCHITECTURE.md) ? [Tests](../../test/README.md).
