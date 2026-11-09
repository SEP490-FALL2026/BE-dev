/**
 * The time a test or hook may take when it builds the whole OpenAPI document (`createOpenApiDocument`) of the application.
 * Measured 26/10/2026 on the G5/G6 tree (296 operations, 314 schemas): `SwaggerModule.createDocument` alone takes 3–4 s,
 * the example, cleanup and presentation steps about 0.7 s more, on top of starting the application — past Jest's default of
 * 5 s on a loaded machine. The work is deterministic; this is its budget, not a wait for something that may not happen.
 */
export const OPENAPI_DOCUMENT_BUDGET_MS = 30_000;
