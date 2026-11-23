/**
 * The exported operations of departments and department IT substitutes, kept in a separate chunk so
 * `api-coverage-manifest.ts` stays under the support-file line limit. Add entries and HTTP tests together.
 */
export const API_COVERAGE_ORGANIZATION: readonly string[] = [
  'GET /api/v1/department-warnings',
  'GET /api/v1/departments',
  'POST /api/v1/departments',
  'GET /api/v1/departments/{id}',
  'PATCH /api/v1/departments/{id}',
  'PUT /api/v1/departments/{id}/avatar',
  'DELETE /api/v1/departments/{id}/avatar',
  'POST /api/v1/departments/{id}/deactivate',
  'GET /api/v1/departments/{id}/employees',
  'GET /api/v1/departments/{id}/employees/{employeeId}',
  'GET /api/v1/departments/{id}/employees/{employeeId}/software-rights',
  'GET /api/v1/departments/{id}/employees/{employeeId}/open-requests',
  'POST /api/v1/departments/{id}/head-assignments',
  'POST /api/v1/departments/{id}/head-vacancies',
  'POST /api/v1/departments/{id}/successor-designations',
  'POST /api/v1/departments/{id}/successor-clearances',
  'GET /api/v1/departments/{id}/technical-members',
  'POST /api/v1/departments/{id}/it-substitutes',
  'POST /api/v1/department-it-substitutes/{id}/end',
  'GET /api/v1/department-it-substitutes',
];
