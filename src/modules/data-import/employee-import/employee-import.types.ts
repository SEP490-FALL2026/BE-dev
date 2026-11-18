export type ImportStatus = 'PREVIEW' | 'COMPLETED' | 'CANCELLED';

/** What the preview says about a people file as a whole (`US-02-01`, `US-02-02`). */
export interface ImportSummary {
  totalRows: number;
  valid: number;
  newUnplaced: number;
  errors: number;
  existingSame: number;
  existingDifferent: number;
  /** The people the confirmation would create, by department. */
  newPeopleByDepartment: { departmentCode: string; count: number }[];
  /** Departments those people join that nobody heads yet (US-02-02 AC-1). */
  departmentsWithoutHead: { code: string; name: string }[];
  /**
   * People who hold a seat and are not in the file: nothing changes for them, an import never marks anyone as gone
   * (US-02-02 AC-4); they are the queue to review. `items` is cut at 200, `total` is not.
   */
  reviewQueue: { total: number; items: { employeeCode: string; fullName: string; seats: number }[] };
  /** The same file, imported before (US-02-01 AC-4). */
  duplicateOf: { importId: string; fileName: string; confirmedAt: string } | null;
}

/** What a confirmation wrote. */
export interface ImportResult {
  created: number;
  newUnplaced: number;
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
  status: ImportStatus;
  previewVersion: number;
  ignoredColumns: string[];
  summary: ImportSummary;
  result: ImportResult | null;
  createdAt: Date;
  expiresAt: Date;
  confirmedAt: Date | null;
  cancelledAt: Date | null;
}
