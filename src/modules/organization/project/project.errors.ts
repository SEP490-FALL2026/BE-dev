/** The caller is not the Super Admin: projects are organization data and the Super Admin's alone, decided in the service whatever the route let through (`F13`). */
export class ProjectForbiddenError extends Error {
  constructor() {
    super('You do not have permission to perform this action on projects.');
    this.name = 'ProjectForbiddenError';
  }
}

export class ProjectNotFoundError extends Error {
  constructor() {
    super('Project not found.');
    this.name = 'ProjectNotFoundError';
  }
}

/** Why a project is refused; each becomes the code `PROJECT.INVALID_<reason>`. */
export const PROJECT_INVALID_REASONS = ['NAME', 'DESCRIPTION', 'DEPARTMENT_NOT_FOUND'] as const;
export type ProjectInvalidReason = (typeof PROJECT_INVALID_REASONS)[number];

export class ProjectInvalidError extends Error {
  constructor(readonly reason: ProjectInvalidReason) {
    super(`The project is not valid: ${reason}.`);
    this.name = 'ProjectInvalidError';
  }
}
