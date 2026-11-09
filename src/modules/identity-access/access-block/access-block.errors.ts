/** The account is refused by the departure of its employee and the departure is still alive: only a cancelled one can be lifted (`QĐ-100q`). */
export class AccessBlockNotReleasableError extends Error {
  constructor() {
    super(
      'The departure of the employee is still under way: the access is blocked until it is cancelled or the employee has left.',
    );
    this.name = 'AccessBlockNotReleasableError';
  }
}
