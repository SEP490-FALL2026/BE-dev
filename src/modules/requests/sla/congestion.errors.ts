/** The person an incident is about, or whose open steps are asked for, is not an employee of the organization. */
export class CongestionHolderNotFoundError extends Error {
  constructor() {
    super('The person the incident is about is not an employee of the organization.');
    this.name = 'CongestionHolderNotFoundError';
  }
}
