/**
 * HTTP operations added in W4 C-VIEW, plus 4 existing request routes moved from `api-coverage-manifest.ts`
 * so the root manifest stays at or under the 400-line support-file limit (`test-support-structure.gate-spec.ts`).
 */
export const API_COVERAGE_W4_C_VIEW: readonly string[] = [
  'GET /api/v1/access-requests/{id}',
  'GET /api/v1/request-tickets/{id}',
  'POST /api/v1/access-requests/{id}/need-decision',
  'POST /api/v1/access-requests/{id}/withdraw',
  'POST /api/v1/access-requests/renewals',
];
