# ADR-0002: Zod HTTP contracts and default-deny authentication

Status: Accepted; authentication reset to a guarded foundation on 2026-10-07.

## Context

Runtime validation, TypeScript DTOs and OpenAPI must agree on the wire contract.
Business endpoints must require authentication without each controller opting in.

## Decision

Use Zod 4 through nestjs-zod for request/response DTOs, including route params.
Keep strict request objects and separate wire data from Prisma records.
Ordinary JSON success uses { success: true, message, data }; message is a stable key.
Describe the full envelope in OpenAPI. Raw/stream/204 responses explicitly opt out.

Register authentication globally; only @Public() bypasses it. The intended mechanism
is account/password plus JWT. Until implemented, supplied tokens receive
503 AUTHENTICATION_NOT_CONFIGURED and missing tokens receive 401.
Do not add a bypass or speculative multi-mode authentication engine.

Keep Joi for environment validation. Security behavior needs negative HTTP tests.
See [ADR-0004](0004-error-contract-availability-and-request-id-trust.md).

## Consequences

Wire schemas cannot expose runtime Date/BigInt directly. Developers must map records
before returning JSON and verify generated OpenAPI in the same change.
