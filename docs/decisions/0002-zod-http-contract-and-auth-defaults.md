# ADR-0002: Use Zod HTTP contracts and default-deny authentication

## Status

**Accepted 2026-08-12 — superseded in part by [ADR-0010](0010-native-password-authentication.md) (2026-10-03).** Superseded: "OIDC Bearer" as the authentication mechanism. Still in force: Zod HTTP contracts, response envelope, deny-by-default with `@Public()` opt-out.

**2026-10-03 amendment:** [ADR-0010](0010-native-password-authentication.md) supersedes the external-OIDC-only authentication direction. Zod HTTP contracts and deny-by-default remain accepted. The restored HEAD still contains OIDC foundation code; native password authentication is not implemented yet.

Accepted. Amended by ADR-0004, which fixes the single 5xx error code, adds 503 for an unreachable identity provider, makes request-id trust configuration-derived, and gives the raw-response exception its concrete form.

## Date

2026-08-12

## Context

The API is consumed through generated OpenAPI clients and will be maintained by a small team using AI coding tools. Runtime validation, TypeScript types and generated documentation must not silently diverge. The system also needs a predictable response contract and must not depend on developers remembering to attach authentication to every business controller.

## Decision

- Use Zod 4 with `nestjs-zod` for new HTTP request and response DTOs.
- Keep wire schemas separate from domain and Prisma representations.
- Wrap ordinary successful JSON responses as `{ success: true, message, data }`; `message` is a stable localization key.
- Describe the complete envelope in OpenAPI so generated clients match the network response.
- Make OIDC Bearer authentication global and deny by default. Only explicitly decorated `@Public()` routes bypass it.
- Do not implement generic AND/OR authentication composition without a concrete second authentication mechanism and threat model.
- Keep Joi for environment validation until a separate migration has measurable value.

## Alternatives considered

### Continue with class-validator

This is the most native NestJS integration, but it separates TypeScript shape, decorators and Swagger metadata. Nested DTOs also require correct runtime class transformation. That creates more omission points for AI-generated code.

### Support generic multi-mode authentication now

This offers hypothetical flexibility but creates ambiguous fallback and downgrade behavior. A future API-key or service-token caller should receive an explicit policy with defined precedence and failure semantics.

### Return unwrapped success payloads

This is simpler, but the team explicitly wants one FE contract. The envelope is accepted only because it is represented in OpenAPI and uses localization keys rather than backend-owned display text.

## Consequences

- `nestjs-zod` becomes part of the HTTP adapter layer and requires compatibility tests with Swagger and Orval.
- Unsupported JSON Schema types such as runtime `Date`, `BigInt` and transforms are prohibited in wire schemas unless explicitly encoded.
- Response validation is required for JSON endpoints; raw/stream/file responses need explicit exceptions. Implemented as `@RawResponse()` — see ADR-0004.
- `strictSchemaDeclaration` applies to every parameter, so route params need a Zod DTO too. A bare `@Param('id')` fails as a 500 rather than a 422 — see ADR-0004.
- Adding a public route or new authentication mode is a security-sensitive review point.
