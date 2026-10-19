export class ProjectNotFoundError extends Error {
  constructor() {
    super('Project not found.');
    this.name = 'ProjectNotFoundError';
  }
}

export class ProjectInvalidError extends Error {
  constructor(readonly reason: 'NAME' | 'DESCRIPTION' | 'DEPARTMENT_NOT_FOUND') {
    super(`The project is not valid: ${reason}.`);
    this.name = 'ProjectInvalidError';
  }
}
