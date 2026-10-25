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
