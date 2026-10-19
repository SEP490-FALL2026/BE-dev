export type JobTitleStatus = 'ACTIVE' | 'INACTIVE';

/** A job title as the catalogue shows it. `version` is internal: it rises with every change, for stale-preview checks. */
export interface JobTitleRecord {
  id: string;
  name: string;
  status: JobTitleStatus;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface JobTitleListFilter {
  status?: JobTitleStatus;
  /** Matched against the normalized name, as a literal substring. */
  search?: string;
  skip: number;
  take: number;
}
