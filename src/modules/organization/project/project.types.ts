export type ProjectStatus = 'RUNNING' | 'FINISHED';

/** What a list of projects shows of each: no description, which only the detail and the department profile carry (`LD-12`). */
export interface ProjectSummaryRecord {
  id: string;
  name: string;
  status: ProjectStatus;
  departments: { id: string; code: string; name: string }[];
  updatedAt: Date;
}

/** How many projects a department profile embeds; the rest are counted in `projectTotal` and read from the list route. */
export const PROFILE_PROJECT_LIMIT = 20;

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
