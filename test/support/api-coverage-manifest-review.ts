/**
 * The exported operations of the review of the accounts at the vendors and of the cases outside the process (`RC-2`, `SBF-08`, `SBF-07a`), a part of
 * `API_COVERAGE_MANIFEST` kept in a file of its own so the manifest stays under the size of a support file. Add entries and HTTP tests together.
 */
export const API_COVERAGE_REVIEW: readonly string[] = [
  'GET /api/v1/vendor-account-discrepancies',
  'POST /api/v1/vendor-account-discrepancies/{id}/decision',
  'GET /api/v1/out-of-process-cases',
  'POST /api/v1/out-of-process-cases/{id}/closure',
];
