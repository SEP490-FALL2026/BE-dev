export type ProjectStatus = 'RUNNING' | 'FINISHED';

/** A project described on department profiles (`US-03-06` AC-14): text, with no members and no approval step. */
export interface ProjectRecord {
  id: string;
  name: string;
  description: string | null;
  status: ProjectStatus;
  departments: { id: string; code: string; name: string }[];
  createdAt: Date;
  updatedAt: Date;
}
