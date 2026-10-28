import type { EmployeeRowOutcome } from './employee-import-rows';
import type { ImportRecord } from './employee-import.repo';
import type { ImportResult, ImportSummary, ImportView } from './employee-import.types';

/** How many rows came out each way: what the preview summary and the confirmation result both report. */
export function outcomeCounts(rows: readonly { outcome: EmployeeRowOutcome }[]) {
  const count = (outcome: EmployeeRowOutcome) => rows.filter((row) => row.outcome === outcome).length;

  return {
    valid: count('VALID'),
    errors: count('ERROR'),
    existingSame: count('EXISTS_SAME'),
    existingDifferent: count('EXISTS_DIFFERENT'),
  };
}

/** One import as the API shows it. */
export function toImportView(record: ImportRecord): ImportView {
  return {
    id: record.id,
    fileName: record.fileName,
    status: record.status,
    previewVersion: record.previewVersion,
    ignoredColumns: record.ignoredColumns,
    // A preview kept before the review queue existed has none.
    summary: {
      ...(record.summary as ImportSummary),
      reviewQueue: (record.summary as Partial<ImportSummary>).reviewQueue ?? { total: 0, items: [] },
    },
    result: (record.result ?? null) as ImportResult | null,
    createdAt: record.createdAt,
    expiresAt: record.expiresAt,
    confirmedAt: record.confirmedAt,
    cancelledAt: record.cancelledAt,
  };
}
