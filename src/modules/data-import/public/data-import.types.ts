/** The latest people file that was not thrown away, as another module reads it (the onboarding checklist, US-02-04). */
export interface LatestEmployeeImport {
  id: string;
  status: 'PREVIEW' | 'COMPLETED';
  /** Rows the preview of that import judged wrong. */
  errorRows: number;
}
