# Security Jobs

Paths in backticks below are relative to the repository root unless stated otherwise.

## Authentication and authorization

- The target login mechanism is backend-managed passwords per accepted [ADR-0010](../decisions/0010-native-password-authentication.md). The restored HEAD still uses OIDC until the reviewed native-auth replacement is built. Do not mistake either the old runtime or the new design for evidence that the migration is complete.
- Authentication is global and deny-by-default. Every anonymous endpoint must opt out with `@Public()` and receive security review.
- Replace OIDC through the reviewed native-auth migration; never add password auth as an outage fallback or run a second implicit production auth mode.
- Do not add a generic AND/OR auth-mode engine for hypothetical flexibility. A real service credential must use an explicit named policy with defined precedence and failure behavior.
- Internal roles, scopes, active state and separation-of-duties rules remain in PostgreSQL.
- Never trust client-provided role claims without mapping them through the trusted identity boundary.
- Tests may use signed/fake principals for HTTP contracts; native-auth live tests require real local credentials, PostgreSQL, mail sink and relevant adapters, with Keycloak stopped. Mocks do not prove password/session/binding behavior.
- Preserve invalid-credential (401) versus dependency-unavailability (503) semantics and redacted operator diagnostics. The old `TOKEN_VERIFICATION_UNAVAILABLE` is an OIDC-baseline contract; the accepted (not implemented) native contract is documented in [native identity design](../architecture/native-identity-workforce-design.md). Verify changed codes through the actual filter and logger.
- Derive inbound request-id trust from configured proxy policy (`TRUST_PROXY_HOPS`), never from client-supplied forwarded headers. See accepted ADR-0004 and the request-id resolver before changing correlation behavior.

## Files and jobs

- Business code depends on the object-storage port, not AWS/MinIO/Cloudflare SDKs.
- MinIO is local/test; Cloudflare R2 is production; both use the S3-compatible adapter.
- Buckets are private. Authorize before issuing a short-lived presigned URL.
- Treat file name, MIME, contents, CSV/XLSX cells and queue payloads as untrusted.
- Every retryable job must be idempotent and store important status in PostgreSQL.
- Persist required delivery intent with the business transaction, then dispatch
  with retry/reconciliation. A deterministic BullMQ job ID alone is not durable
  business deduplication after job removal. Lease/fence long-running jobs so a
  stale worker cannot overwrite a newer result.
- Verify the actual uploaded bytes, bind previews to an immutable object/snapshot,
  and check ownership/purpose before attaching files as well as before download.
  A completed presigned upload can still be overwritten until its URL expires
  unless the design seals or versions the object.
- Trusted proxy settings assume the API is reachable only through the configured
  ingress and that ingress replaces untrusted forwarding/request-ID headers.
  Positive TRUST_PROXY_HOPS alone does not authenticate a caller or a request ID.
