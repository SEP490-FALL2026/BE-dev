import type { ImportRecord } from './employee-import.repo';

/** What the preview says about a people file as a whole (`US-02-01`, `US-02-02`). */
export interface ImportSummary {
  totalRows: number;
  valid: number;
  errors: number;
  existingSame: number;
  existingDifferent: number;
  /** The people the confirmation would create, by department. */
  newPeopleByDepartment: { departmentCode: string; count: number }[];
  /** Departments those people join that nobody heads yet (US-02-02 AC-1). */
  departmentsWithoutHead: { code: string; name: string }[];
  /** The same file, imported before (US-02-01 AC-4). */
  duplicateOf: { importId: string; fileName: string; confirmedAt: string } | null;
}

/** What a confirmation wrote. */
export interface ImportResult {
  created: number;
  existingSame: number;
  existingDifferent: number;
  errors: number;
  createdByDepartment: { departmentCode: string; count: number }[];
  departmentsWithoutHead: { code: string; name: string }[];
}

/** One import as its routes answer it: the preview, and the result once written. */
export interface ImportView {
  id: string;
  fileName: string;
  status: ImportRecord['status'];
  previewVersion: number;
  ignoredColumns: string[];
  summary: ImportSummary;
  result: ImportResult | null;
  createdAt: Date;
  expiresAt: Date;
  confirmedAt: Date | null;
  cancelledAt: Date | null;
}
