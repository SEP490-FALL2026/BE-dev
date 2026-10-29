/** The installation input does not pass its schema; every issue is named. Nothing was changed. */
export class InstallationInputError extends Error {
  constructor(readonly issues: string[]) {
    super(`The installation input is not valid:\n - ${issues.join('\n - ')}`);
    this.name = 'InstallationInputError';
  }
}

/**
 * What standard input carried for `--password-stdin` is not the one bounded record the command accepts (a terminal, no
 * record, no line feed, a second line, a control character, invalid UTF-8, too long, too slow). The message says what is
 * wrong with the record, never what the record said, so it can be printed and logged as is. Nothing was changed.
 */
export class StdinPasswordError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StdinPasswordError';
  }
}

/**
 * `ops:preflight --recovery-target` was given labels it cannot read (not `null` nor an object of strings, or a malformed
 * representation name): the way back is then unknown, never assumed (recovery-target.policy.ts).
 */
export class RecoveryTargetLabelsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RecoveryTargetLabelsError';
  }
}

/** The installation already has an organization. Nothing was changed. */
export class AlreadyInstalledError extends Error {
  constructor() {
    super('This installation already has an organization; nothing was changed.');
    this.name = 'AlreadyInstalledError';
  }
}

/** `ops:demo-dataset`: the demo accounts changed between the read and the write (someone wrote meanwhile). Nothing was written. */
export class DemoAccountsChangedError extends Error {
  constructor() {
    super('The demo accounts changed while they were being written; nothing was written. Run the command again.');
    this.name = 'DemoAccountsChangedError';
  }
}
