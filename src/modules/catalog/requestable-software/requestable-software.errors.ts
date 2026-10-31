/** The application does not exist, is retired, has no plan, or is of a kind nobody asks for: it is not offered. */
export class RequestableApplicationNotFoundError extends Error {
  constructor() {
    super('The application is not offered for a request.');
    this.name = 'RequestableApplicationNotFoundError';
  }
}

/** The plan does not exist, or its application is not offered for a request. */
export class RequestablePlanNotFoundError extends Error {
  constructor() {
    super('The plan is not offered for a request.');
    this.name = 'RequestablePlanNotFoundError';
  }
}

/** The caller belongs to no department today, so they can send no request and nothing is offered to them. */
export class RequestableSoftwareNoDepartmentError extends Error {
  constructor() {
    super('You belong to no department today, so you cannot request software.');
    this.name = 'RequestableSoftwareNoDepartmentError';
  }
}
