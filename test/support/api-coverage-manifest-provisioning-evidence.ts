export const API_COVERAGE_PROVISIONING_EVIDENCE = [
  'POST /api/v1/provisioning-tasks/{id}/complete',
  'POST /api/v1/provisioning-tasks/{id}/revocation-completion',
  'POST /api/v1/provisioning-tasks/{id}/access-cut',
  'GET /api/v1/provisioning-tasks/{id}/evidence-files',
  'POST /api/v1/provisioning-tasks/{id}/evidence-files/{fileId}/links',
] as const;
