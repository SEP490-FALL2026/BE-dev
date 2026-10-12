# ADR-0004: Error contract and request-ID trust

Status: Accepted. Applies to the current foundation.

## Context and decision

Unknown server faults return INTERNAL_SERVER_ERROR. Deliberate application codes
survive the exception filter, including availability errors.

Invalid credentials return 401. An unavailable authentication dependency returns
503 TOKEN_VERIFICATION_UNAVAILABLE, with details only in sanitized internal logs.
_Update 12/10/2026:_ the unimplemented verifier and `503 AUTHENTICATION_NOT_CONFIGURED` no longer exist;
the real verifier is described in [ADR-0011](0011-internal-authentication-and-sessions.md) (Proposed).

Never log bearer tokens, cookies or passwords. Rejected tokens must not cause one
error log per request, which would amplify abuse.

Request-ID trust derives from TRUST_PROXY_HOPS. Client-supplied forwarded headers
do not establish trust. With zero trusted hops, replace incoming request IDs.
A trusted ingress must overwrite headers supplied by clients.

Route parameters need Zod DTOs, like body/query input. @RawResponse() explicitly
opts out for documented streams/files/redirects/204, not ordinary JSON.

## Consequences and verification

Test fallback 500 codes, deliberate 503 codes, logging through the real logger,
and forged proxy/request-ID headers. Guard execution precedes DTO validation;
resource authorization must use validated input. Deployment proxy configuration
must match the actual network topology.
