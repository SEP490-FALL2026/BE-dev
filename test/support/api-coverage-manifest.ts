/** Inventory of exported HTTP operations. Add entries and HTTP tests together. */
export const API_COVERAGE_MANIFEST: readonly string[] = [
  'GET /api/v1/health/live',
  'GET /api/v1/health/ready',
  'GET /api/v1/me',
  'POST /api/v1/auth/login',
  'POST /api/v1/auth/logout',
  'POST /api/v1/auth/refresh',
];
