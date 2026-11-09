import type { RouteErrorStatus } from './openapi-example-manifest';

const SOURCE_SAVE_422 = [
  'USAGE_SOURCE.APPLICATION_INTERNAL',
  'USAGE_SOURCE.APPLICATION_NOT_FOUND',
  'USAGE_SOURCE.APPLICATION_RETIRED',
  'USAGE_SOURCE.COMMUNICATION_APP',
  'USAGE_SOURCE.TEMPLATE_CAPABILITY_MISMATCH',
  'USAGE_SOURCE.TEMPLATE_INVALID',
];

/**
 * Part of ROUTE_ERROR_CODES (usage), traced on BE `qd103-vendor-usage-import`: each code is raised by `vendor-source.service.ts`,
 * `vendor-import.service.ts`, `vendor-import-confirmation.service.ts` or the readers of the parse group and mapped in
 * `vendor-source.http-errors.ts` and `vendor-import.http-errors.ts`.
 */
export const ROUTE_ERROR_CODES_USAGE: Readonly<Record<string, Partial<Record<RouteErrorStatus, readonly string[]>>>> = {
  usageSourceCreate: { '409': ['USAGE_SOURCE.NAME_TAKEN'], '422': SOURCE_SAVE_422 },
  usageSourceGet: { '404': ['USAGE_SOURCE.NOT_FOUND'] },
  usageSourceUpdate: {
    '404': ['USAGE_SOURCE.NOT_FOUND'],
    '409': ['USAGE_SOURCE.IN_USE', 'USAGE_SOURCE.NAME_TAKEN'],
    '422': SOURCE_SAVE_422,
  },
  usageImportUpload: {
    '404': ['USAGE_SOURCE.NOT_FOUND'],
    '422': [
      'USAGE_IMPORT.FILE_EMPTY',
      'USAGE_IMPORT.FILE_MISSING_COLUMNS',
      'USAGE_IMPORT.FILE_NOT_TEXT',
      'USAGE_IMPORT.FILE_REQUIRED',
      'USAGE_IMPORT.FILE_TOO_MANY_ROWS',
      'USAGE_IMPORT.FILE_UNREADABLE',
      'USAGE_IMPORT.REPORT_INVALID',
      'USAGE_IMPORT.SCHEMA_UNSUPPORTED',
      'USAGE_IMPORT.SOURCE_MISMATCH',
      'USAGE_IMPORT.WINDOW_INVALID',
      'USAGE_IMPORT.WINDOW_REQUIRED',
      'USAGE_SOURCE.APPLICATION_INTERNAL',
      'USAGE_SOURCE.APPLICATION_RETIRED',
      'USAGE_SOURCE.COMMUNICATION_APP',
      'VALIDATION_ERROR',
    ],
  },
  usageImportGet: { '404': ['USAGE_IMPORT.NOT_FOUND'] },
  usageImportRowList: { '404': ['USAGE_IMPORT.NOT_FOUND'] },
  usageImportConfirm: {
    '404': ['USAGE_IMPORT.NOT_FOUND'],
    '409': ['USAGE_IMPORT.ALREADY_CONFIRMED', 'USAGE_IMPORT.NOT_OPEN', 'USAGE_IMPORT.PREVIEW_STALE'],
    '422': [
      'USAGE_IMPORT.EVENT_TYPE_UNMAPPED',
      'USAGE_IMPORT.TRACKING_NOTICE_REQUIRED',
      'USAGE_SOURCE.COMMUNICATION_APP',
    ],
  },
  usageUnmatchedIdentityResolve: {
    '404': ['USAGE_IDENTITY.UNMATCHED_NOT_FOUND'],
    '409': ['USAGE_IDENTITY.ALREADY_HANDLED', 'USAGE_IDENTITY.ALREADY_MAPPED'],
    '422': ['USAGE_IDENTITY.EMPLOYEE_NOT_FOUND'],
  },
  usageUnmatchedIdentityDismiss: {
    '404': ['USAGE_IDENTITY.UNMATCHED_NOT_FOUND'],
    '409': ['USAGE_IDENTITY.ALREADY_HANDLED'],
  },
  usageIdentityMappingEnd: {
    '404': ['USAGE_IDENTITY.MAPPING_NOT_FOUND'],
    '409': ['USAGE_IDENTITY.MAPPING_ENDED'],
  },
  usageImportCancel: { '404': ['USAGE_IMPORT.NOT_FOUND'], '409': ['USAGE_IMPORT.NOT_PREVIEW'] },
};
