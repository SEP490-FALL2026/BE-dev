import type { RouteErrorStatus } from './openapi-example-manifest';

/** Part of ROUTE_ERROR_CODES (data import), traced on BE `ea73c2f` (25/10/2026): see openapi-example-manifest.ts. */
export const ROUTE_ERROR_CODES_DATA_IMPORT: Readonly<
  Record<string, Partial<Record<RouteErrorStatus, readonly string[]>>>
> = {
  employeeImportCancel: {
    '404': ['IMPORT.NOT_FOUND'],
    '409': ['IMPORT.NOT_PREVIEW'],
  },
  employeeImportConfirm: {
    '404': ['IMPORT.NOT_FOUND'],
    '409': [
      'IMPORT.ALREADY_CONFIRMED',
      'IMPORT.CANCELLED',
      'IMPORT.DUPLICATE_FILE_NOT_ACKNOWLEDGED',
      'IMPORT.EXPIRED',
      'IMPORT.PREVIEW_OUTDATED',
      'IMPORT.PREVIEW_STALE',
    ],
  },
  employeeImportGet: {
    '404': ['IMPORT.NOT_FOUND'],
  },
  employeeImportPreviewRefresh: {
    '404': ['IMPORT.NOT_FOUND'],
    '409': ['IMPORT.CANCELLED', 'IMPORT.NOT_PREVIEW'],
  },
  employeeImportRowList: {
    '404': ['IMPORT.NOT_FOUND'],
  },
  employeeImportUpload: {
    '422': [
      'IMPORT.FILE_EMPTY',
      'IMPORT.FILE_FORMAT_UNSUPPORTED',
      'IMPORT.FILE_MISSING_COLUMNS',
      'IMPORT.FILE_NOT_TEXT',
      'IMPORT.FILE_REQUIRED',
      'IMPORT.FILE_TOO_MANY_ROWS',
      'IMPORT.FILE_UNREADABLE',
    ],
  },
  seatBaselineImportCancel: {
    '404': ['SEAT_BASELINE_IMPORT.NOT_FOUND'],
    '409': ['SEAT_BASELINE_IMPORT.NOT_PREVIEW'],
  },
  seatBaselineImportConfirm: {
    '404': ['SEAT_BASELINE_IMPORT.NOT_FOUND'],
    '409': [
      'SEAT_BASELINE.CLOSED',
      'SEAT_BASELINE_IMPORT.ALREADY_CONFIRMED',
      'SEAT_BASELINE_IMPORT.CANCELLED',
      'SEAT_BASELINE_IMPORT.EXPIRED',
      'SEAT_BASELINE_IMPORT.PREVIEW_OUTDATED',
      'SEAT_BASELINE_IMPORT.PREVIEW_STALE',
      'SEAT_TARGET.APPLICATION_RETIRED',
    ],
    '422': ['SEAT_BASELINE.PLAN_NOT_SUPPORTED', 'SEAT_BASELINE.TARGET_INVALID', 'SEAT_TARGET.SUBSCRIPTION_DRAFT'],
  },
  seatBaselineImportGet: {
    '404': ['SEAT_BASELINE_IMPORT.NOT_FOUND'],
  },
  seatBaselineImportRows: {
    '404': ['SEAT_BASELINE_IMPORT.NOT_FOUND'],
  },
  seatBaselineImportUpload: {
    '404': ['PLAN.NOT_FOUND', 'SUBSCRIPTION.NOT_FOUND'],
    '409': ['SEAT_BASELINE.CLOSED', 'SEAT_BASELINE.QUANTITY_UNKNOWN', 'SEAT_TARGET.APPLICATION_RETIRED'],
    '422': [
      'SEAT_BASELINE.PLAN_NOT_SUPPORTED',
      'SEAT_BASELINE.TARGET_INVALID',
      'SEAT_BASELINE_IMPORT.FILE_EMPTY',
      'SEAT_BASELINE_IMPORT.FILE_MISSING_COLUMNS',
      'SEAT_BASELINE_IMPORT.FILE_NOT_TEXT',
      'SEAT_BASELINE_IMPORT.FILE_REQUIRED',
      'SEAT_BASELINE_IMPORT.FILE_TOO_MANY_ROWS',
      'SEAT_BASELINE_IMPORT.FILE_UNREADABLE',
      'SEAT_TARGET.SUBSCRIPTION_DRAFT',
      'VALIDATION_ERROR',
    ],
  },
};
