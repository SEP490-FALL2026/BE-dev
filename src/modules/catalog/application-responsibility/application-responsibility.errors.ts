/** The caller may not hand this application over: it still has a responsible IT Admin who is not them (`QĐ-111g`, `R-26`). */
export class ApplicationResponsibilityForbiddenError extends Error {
  constructor() {
    super('Only the IT Admin responsible for the application hands it over; any IT Admin takes it while it needs one.');
    this.name = 'ApplicationResponsibilityForbiddenError';
  }
}

/** The person to hand the application to is not an IT Admin who works now. */
export class ApplicationResponsibleNotItAdminError extends Error {
  constructor() {
    super('The IT Admin responsible for an application must be an IT Admin who is working now.');
    this.name = 'ApplicationResponsibleNotItAdminError';
  }
}
