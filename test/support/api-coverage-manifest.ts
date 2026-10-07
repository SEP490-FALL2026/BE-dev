/** Inventory of exported HTTP operations. Add entries and HTTP tests together. */
export const API_COVERAGE_MANIFEST: readonly string[] = [
  'GET /api/v1/catalog-applications',
  'GET /api/v1/catalog-applications/{id}',
  'GET /api/v1/health/live',
  'GET /api/v1/health/ready',
  'POST /api/v1/catalog-applications',
];
