# Security Jobs

Paths in backticks below are relative to the repository root unless stated otherwise.

## Authentication and authorization

- OIDC is the login protocol; the API verifies JWT access tokens. Do not use an ID token to call the API.
- Authentication is global and deny-by-default. Every anonymous endpoint must opt out with `@Public()` and receive security review.
- Do not add password auth as an outage fallback or create a second production auth mode.
- Do not add a generic AND/OR auth-mode engine for hypothetical flexibility. A real service credential must use an explicit named policy with defined precedence and failure behavior.
- Internal roles, scopes, active state and separation-of-duties rules remain in PostgreSQL.
- Never trust client-provided role claims without mapping them through the trusted identity boundary.
- Tests normally use signed/fake principal fixtures; only dedicated auth E2E requires Keycloak.
- Preserve the accepted distinction between invalid credentials (401, not logged per rejected token) and identity-provider unavailability (503, cause logged without credentials). Unknown verifier defects must surface rather than become invalid-token errors. Verify outage handling through the real logger when that boundary changes.
- Derive inbound request-id trust from configured proxy policy (`TRUST_PROXY_HOPS`), never from client-supplied forwarded headers. See accepted ADR-0004 and the request-id resolver before changing correlation behavior.

## Files and jobs

- Business code depends on the object-storage port, not AWS/MinIO/Cloudflare SDKs.
- MinIO is local/test; Cloudflare R2 is production; both use the S3-compatible adapter.
- Buckets are private. Authorize before issuing a short-lived presigned URL.
- Treat file name, MIME, contents, CSV/XLSX cells and queue payloads as untrusted.
- Every retryable job must be idempotent and store important status in PostgreSQL.
