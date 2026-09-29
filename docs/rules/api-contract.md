# Api Contract

Paths in backticks below are relative to the repository root unless stated otherwise.

## HTTP contracts

- Use Zod 4 DTOs through `nestjs-zod`; do not add `class-validator` DTOs or plain interfaces at an HTTP boundary.
- Request objects use `z.strictObject`. Request and response schemas are separate when coercion/defaults or wire/domain representations differ.
- Wire dates are ISO strings. Map Prisma `Date`, `Decimal`, `BigInt` and entities before returning; never expose Prisma values directly.
- Ordinary JSON success responses use `{ success: true, message, data }`. Apply `@ApiSuccessResponse(...)` with the complete envelope DTO so runtime validation and OpenAPI agree.
- `message` is an uppercase localization key such as `COMMON.SUCCESS`, not English/Vietnamese display copy.
- Streams, redirects, files, raw responses and 204 responses are explicit exceptions; document and test them rather than bypassing the interceptor casually.
- Guards run before pipes. Never inspect body/query/params in an authorization guard as if Zod has already validated them.
- Declare route params with a Zod DTO (for example `@Param() params: IdParamsDto`), not primitive `@Param('id')`. The global pipe uses `strictSchemaDeclaration`; an undeclared schema fails as a server error. See accepted [ADR-0004](../decisions/0004-error-contract-availability-and-request-id-trust.md).

## API and localization

- REST base path is `/api/v1`; resource paths are plural kebab-case.
- Errors use stable machine-readable codes. UI text is localized by FE; do not make FE branch on error messages.
- Backend localization is limited to backend-rendered email, notification and export templates.
- Store UTC timestamps and machine-readable enum/status values.
- Preserve deliberate error codes; `INTERNAL_SERVER_ERROR` is the fallback for 5xx without one. Document `503 TOKEN_VERIFICATION_UNAVAILABLE` on authenticated operations; invalid tokens remain `401 INVALID_ACCESS_TOKEN`. Follow accepted ADR-0004 and the current filter rather than interpreting a shorthand “all 5xx” sentence as a blanket override.

## Contract handoff to frontend

After an HTTP/DTO change, run relevant API E2E tests and `pnpm openapi:export`, then
review `openapi.json`. Use stable operation IDs, exactly one declared business tag
per operation, `*Request` body schemas and `*Response` success schemas compatible
with the frontend validator. Describe the full runtime envelope and error responses.

Coordinate the FE snapshot `openapi/openapi.yaml`, `pnpm api:generate` and consumer
checks in the same task when both repositories are available. Do not edit generated
FE code or change an API only in the FE snapshot. Verify URL/version composition
against the real API. If a consumer update cannot be completed, identify the exact
contract changes and outstanding validation in the handoff.
