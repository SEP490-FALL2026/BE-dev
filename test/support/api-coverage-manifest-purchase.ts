import { API_COVERAGE_WAVE2 } from './api-coverage-manifest-wave2';

/**
 * The exported operations of the purchases of a department and what comes of an invoice that differs (`PI-1`, `PI-2`, `RC-1`), a part of
 * `API_COVERAGE_MANIFEST` kept in a file of its own so the manifest stays under the size of a support file. Add entries and HTTP tests together.
 */
export const API_COVERAGE_PURCHASE: readonly string[] = [
  ...API_COVERAGE_WAVE2,
  'POST /api/v1/purchase-invoices/preview',
  'POST /api/v1/purchase-invoices',
  'POST /api/v1/purchase-invoices/{id}/resubmission',
  'GET /api/v1/purchase-invoices',
  'GET /api/v1/purchase-invoices/missing-periods',
  'GET /api/v1/purchase-invoices/{id}',
  'POST /api/v1/purchase-invoices/{id}/confirmation',
  'POST /api/v1/purchase-invoices/{id}/return',
  'GET /api/v1/invoice-discrepancies',
  'GET /api/v1/invoice-discrepancies/{id}',
  'POST /api/v1/invoice-discrepancies/{id}/closure',
];
