/** The operations of the policies, the template of an import file and the picture and work phone of a person (PL-1, PL-3, PF-1), part of the coverage manifest. */
export const POLICY_AND_PROFILE_OPERATIONS: readonly string[] = [
  'GET /api/v1/policies',
  'GET /api/v1/policies/{code}',
  'GET /api/v1/policies/{code}/versions',
  'GET /api/v1/policies/{code}/steps/{stepCode}',
  'GET /api/v1/policies/{code}/draft',
  'PUT /api/v1/policies/{code}/draft',
  'DELETE /api/v1/policies/{code}/draft',
  'POST /api/v1/policies/{code}/draft/publish',
  'POST /api/v1/policies/{code}/acknowledgements',
  'GET /api/v1/policies/{code}/acknowledgements',
  'GET /api/v1/import-templates/{kind}',
  'PUT /api/v1/me/avatar',
  'DELETE /api/v1/me/avatar',
  'PATCH /api/v1/me/profile',
  'POST /api/v1/employee-profiles/lookup',
  'DELETE /api/v1/app-users/{id}/avatar',
];
