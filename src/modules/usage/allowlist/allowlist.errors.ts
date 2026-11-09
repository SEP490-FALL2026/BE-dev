/** A tool is mapped to an application that is not in the catalog. */
export class CollectorAllowlistApplicationNotFoundError extends Error {
  constructor() {
    super('The application does not exist.');
    this.name = 'CollectorAllowlistApplicationNotFoundError';
  }
}

/** The application is software the company built, a messaging or meeting service, or retired: its usage is not collected. */
export class CollectorAllowlistApplicationNotEligibleError extends Error {
  constructor() {
    super('Usage of this application is not collected.');
    this.name = 'CollectorAllowlistApplicationNotEligibleError';
  }
}

/** The list would be the same as the one in force. */
export class CollectorAllowlistUnchangedError extends Error {
  constructor() {
    super('The list is the same as the one in force.');
    this.name = 'CollectorAllowlistUnchangedError';
  }
}
