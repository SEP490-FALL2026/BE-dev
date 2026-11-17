/**
 * What the link of a request to the catalog says when the IT Admin ticks "add to the list of the department" (`QĐ-111c`, SPEC FE IN-1): the
 * department of the request, the application and the plan the request was linked to, and a note for the people who read the list.
 */
export interface DepartmentSoftwareFromCatalogLink {
  departmentId: string;
  applicationId: string;
  /** The plan linked, or null when only the application is. */
  planId: string | null;
  note?: string | null;
}

/** The entry of the place in the list of the department, and whether this call wrote it (false: it was listed already). */
export interface DepartmentSoftwareEntryResult {
  entryId: string;
  added: boolean;
}
