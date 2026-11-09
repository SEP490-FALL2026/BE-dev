/**
 * What a request is priced by and what a seat sits on used to be the subscription of the department the request is of (F38, F20, `QĐ-89a`),
 * so this gave every department a copy of every plan the seeded department held. Since `BR-MF1-09` / `QĐ-103d` the seats of a plan are one
 * pool for every department and a second subscription of a K2 or K4 plan is refused once the seat baseline is closed, so a department owns
 * no copy: every call here answers with the subscription it was given. The shape stays so the suites written for the old rule keep their
 * call sites. No assertion lives here.
 */
export class OwnedSubscriptions {
  /** The subscription a department's seat sits on: the one given, the pool is shared. */
  subscriptionFor(subscriptionId: string, _departmentId: string): string {
    return subscriptionId;
  }

  /** Nothing to remember: a grant is made on the subscription the body names. */
  noteRequest(_requestId: string, _departmentId: string): void {
    // Intentionally empty.
  }

  /** The body of a grant, as it is. */
  grantBody<T extends object>(body: T): T {
    return body;
  }
}
