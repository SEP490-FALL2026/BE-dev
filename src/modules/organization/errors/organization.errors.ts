export class OrganizationAlreadyExistsError extends Error {
  constructor() {
    super('An organization already exists for this installation.');
    this.name = 'OrganizationAlreadyExistsError';
  }
}
