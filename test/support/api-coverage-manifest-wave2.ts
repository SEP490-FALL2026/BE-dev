/**
 * The operations redesign wave 2 adds, a part of `API_COVERAGE_MANIFEST` (reached through `API_COVERAGE_PURCHASE`) kept in a file of its own so the
 * manifest stays under the size of a support file and the lanes of the wave do not meet in the same lines. Add entries and HTTP tests together.
 */
export const API_COVERAGE_WAVE2: readonly string[] = [
  // W2-27 H16: the Super Admin names the IT Admin who answers for a subscription.
  'POST /api/v1/subscriptions/{id}/responsible-it-admin',
  // W2-21: the IT Admin raises the cap of activations of a license key.
  'PATCH /api/v1/license-keys/{id}',
];
