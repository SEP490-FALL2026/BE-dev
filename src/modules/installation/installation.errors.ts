/** The installation input does not pass its schema; every issue is named. Nothing was changed. */
export class InstallationInputError extends Error {
  constructor(readonly issues: string[]) {
    super(`The installation input is not valid:\n - ${issues.join('\n - ')}`);
    this.name = 'InstallationInputError';
  }
}

/** The installation already has an organization. Nothing was changed. */
export class AlreadyInstalledError extends Error {
  constructor() {
    super('This installation already has an organization; nothing was changed.');
    this.name = 'AlreadyInstalledError';
  }
}
