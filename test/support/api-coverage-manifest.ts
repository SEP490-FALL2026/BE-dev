/**
 * Every HTTP operation the API exports, as `METHOD /path` with the OpenAPI path template.
 * B1a seeds the five baseline operations; the package that adds an operation adds its key in the
 * same change. B10a replaces the plain keys with entries that link policy, success,
 * unauthenticated, wrong-role, validation and scope cases to test IDs.
 */
export const API_COVERAGE_MANIFEST: readonly string[] = [
  'GET /api/v1/catalog-applications',
  'GET /api/v1/catalog-applications/{id}',
  'GET /api/v1/health/live',
  'GET /api/v1/health/ready',
  'POST /api/v1/catalog-applications',
];
