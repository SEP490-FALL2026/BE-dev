/** Inventory of exported HTTP operations. Add entries and HTTP tests together. */
export const API_COVERAGE_MANIFEST: readonly string[] = [
  'GET /api/v1/health/live',
  'GET /api/v1/health/ready',
  'GET /api/v1/me',
  'GET /api/v1/account-candidates',
  'GET /api/v1/app-users',
  'POST /api/v1/app-users',
  'GET /api/v1/app-users/{id}',
  'POST /api/v1/app-users/{id}/invitations',
  'POST /api/v1/app-users/{id}/lock',
  'POST /api/v1/app-users/{id}/unlock',
  'POST /api/v1/app-users/{id}/role-grants',
  'DELETE /api/v1/app-users/{id}/role-grants/{role}',
  'POST /api/v1/auth/invitations/redeem',
  'POST /api/v1/auth/login',
  'POST /api/v1/auth/logout',
  'POST /api/v1/auth/refresh',
];
