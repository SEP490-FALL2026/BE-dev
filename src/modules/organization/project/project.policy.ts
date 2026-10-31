import { ProjectForbiddenError } from './project.errors';

/**
 * Who may keep and read the projects described on department profiles, decided in the service so no route is the only thing
 * between a caller and the data. Projects are organization data: the Super Admin keeps them on an HR basis and reads them;
 * the IT Admin and everyone else do neither (`QĐ-87a`). Pure: no store, no clock.
 */

/** Listing, reading, adding and changing a project: the Super Admin alone. Throws ProjectForbiddenError. */
export function assertMayKeepProjects(roles: readonly string[]): void {
  if (!roles.includes('SUPER_ADMIN')) throw new ProjectForbiddenError();
}
