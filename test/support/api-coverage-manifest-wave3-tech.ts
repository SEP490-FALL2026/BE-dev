/**
 * The operations redesign wave 3 adds in the tech lane, a part of `API_COVERAGE_MANIFEST` (reached through `API_COVERAGE_PURCHASE`) kept in a file of
 * its own so the manifest stays under the size of a support file and the two lanes do not meet in the same lines. Add entries and HTTP tests together.
 */
export const API_COVERAGE_WAVE3_TECH: readonly string[] = [
  // W3-10: the workspaces the company holds at its vendors.
  'GET /api/v1/workspaces',
  'POST /api/v1/workspaces',
  'GET /api/v1/workspaces/{id}',
  'PATCH /api/v1/workspaces/{id}',
  'PUT /api/v1/workspaces/{id}/admins',
  'POST /api/v1/workspaces/{id}/responsible-it-admin',
  // W3-24: the lots of licenses of a K4 plan.
  'GET /api/v1/license-lots',
  'POST /api/v1/license-lots',
  'GET /api/v1/license-lots/{id}',
  'PATCH /api/v1/license-lots/{id}',
  'POST /api/v1/license-lots/{id}/keys',
  'POST /api/v1/license-lots/{id}/responsible-it-admin',
  // W3-15: subscription lines and seat changes.
  'POST /api/v1/subscriptions/{id}/lines',
  'PATCH /api/v1/subscription-lines/{id}',
  'GET /api/v1/subscription-lines/{id}/seat-changes',
];
