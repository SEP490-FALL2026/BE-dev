# ADR-0004: One error code per server fault, explicit availability signalling, and configuration-derived request-id trust

## Status

Accepted 2026-08-21. Amends ADR-0002, which it does not replace.

**2026-10-03 annotation:** the "unreachable identity provider is 503 `TOKEN_VERIFICATION_UNAVAILABLE`" decision describes the OIDC baseline and is superseded in part by [ADR-0010](0010-native-password-authentication.md): the native replacement defines its own dependency-failure contract in the [native design](../architecture/native-identity-workforce-design.md) (Proposed). The single-5xx-code, request-id-trust, route-param and `@RawResponse()` decisions are unaffected, as is the 401-versus-503 distinction.

## Date

2026-08-21

## Context

The HTTP contract accepted in ADR-0002 held up, but building against it surfaced four decisions that document nothing until they are written down. Three of them were made in response to defects found in review; one was forced by the validation pipe's own configuration.

Two of the defects had passing tests. That matters for how these rules are phrased: each carries the test that must exist for it, because the rule alone did not prevent the bug.

## Decision

### Every 5xx answers with one code

Any response with status ≥ 500 that carries no deliberate error code answers `INTERNAL_SERVER_ERROR`. The `HTTP_`-prefixed form derived from the status remains for 4xx fallbacks only.

Before this, a thrown `Error` produced `INTERNAL_SERVER_ERROR` while a `ZodSerializationException` — also a 500 — fell through to `HTTP_INTERNAL_SERVER_ERROR`. A client branching on `code` saw two codes for one situation it cannot act on differently.

### An unreachable identity provider is 503, not 401

When token verification cannot be completed because the identity provider is unreachable, the API answers `503 TOKEN_VERIFICATION_UNAVAILABLE` and logs the cause. An invalid token remains `401 INVALID_ACCESS_TOKEN` and is deliberately **not** logged, because rejected tokens are normal and high-volume and logging each one hands an attacker a log-flooding vector.

Classification lives in the verifier adapter, which is the only code that knows `jose`. It is an allow-list of token error codes rather than a deny-list of infrastructure ones: `jose` does not wrap socket failures, so an unreachable JWKS host arrives as a plain `Error` with a Node syscall code and no JOSE code at all. A deny-list would have to enumerate every network failure and would misreport the ones it missed as bad tokens.

Any failure matching neither class is re-thrown, so a defect in the verifier surfaces as a 500 rather than being disguised as an authentication failure forever.

### Inbound request-id trust comes from configuration, never from a header

An inbound `x-request-id` is honoured only when `TRUST_PROXY_HOPS > 0`. Deriving trust from `x-forwarded-for` or `x-real-ip` is not protection: those headers are client-controlled, so any caller could assert a proxy hop and then pin every request to an identifier of its choosing — including one already in somebody else's audit trail.

The resolver takes its trust decision as a **required** parameter so the compiler forces every call site to state it, rather than letting the unsafe behaviour be reached by omission.

### Route parameters need a declared schema like any other input

The global validation pipe runs with `strictSchemaDeclaration`, so a primitive `@Param('id')` has no schema to validate against and fails as a **500**, not a 422. Route params are wrapped in a Zod DTO, which also makes an invalid identifier produce the same `VALIDATION_ERROR` envelope as an invalid body.

### Non-JSON responses opt out of the envelope explicitly

`@RawResponse()` marks a handler whose body is a stream, file, redirect or 204. ADR-0002 anticipated this exception; this is its concrete form. It must not be used to avoid declaring a response DTO — an endpoint returning JSON stays enveloped so the published contract keeps describing what clients receive.

## Alternatives considered

### Keep `HTTP_INTERNAL_SERVER_ERROR` as the single 5xx code

Rejected. Deriving every fallback from the status is more uniform, but the `HTTP_` prefix exists to mark a code nobody chose deliberately, and a server fault deserves the deliberate one. Either would have worked; having two did not.

### Keep answering 401 during an identity-provider outage, and only add logging

Rejected. It tells the client to re-authenticate when the token was fine, so users are sent to a login screen that cannot help them, and clients retry the wrong thing. The disclosure it avoids — that our identity provider is down — is negligible next to that.

### Log rejected tokens as well as outages

Rejected. It reads as thorough and is a denial-of-service assist: an attacker fills the log for the cost of one bad request per line.

### Reject an untrusted inbound request-id outright rather than replacing it

Deferred, not rejected. Replacing is quieter and loses nothing today. Revisit if correlation across a proxy hop ever needs to distinguish "the caller supplied a bad id" from "the caller supplied none".

## Consequences

- Every authenticated route can answer 503, so `@ApiErrorResponses` on those routes must document it and generated clients must handle it.
- `TRUST_PROXY_HOPS` now governs two behaviours — rate-limit bucketing and request-id trust. Deploying behind a proxy without setting it degrades both silently, so it is documented at the variable itself in `.env.example`.
- A new route with a path parameter cannot use a bare `@Param('id')`. The failure is a 500, which reads as a bug in the handler rather than a missing DTO, so this is stated in `ARCHITECTURE.md` section 9 where route authors will find it.
- These rules need the tests named below. Each of the first three shipped once with a green test that could not fail for the reason it claimed:
  - the 5xx rule needs a test asserting an `HttpException` 500 and a plain thrown `Error` produce the same code;
  - the availability rule needs a test that logs through the **real** application logger, because a mocked logger hides that passing an object where a string trace is expected throws inside the logger and converts the 503 into a 500;
  - the trust rule needs a test that sends `x-forwarded-for` alongside a chosen `x-request-id` and asserts the id is ignored.

## Revisit triggers

- a second authentication mechanism arrives, which reopens the classification and precedence questions ADR-0002 deferred;
- a caller needs to distinguish 5xx causes, which would mean the single code is now hiding something actionable;
- the API is deployed behind a proxy whose request-id semantics differ from a simple pass-through.
