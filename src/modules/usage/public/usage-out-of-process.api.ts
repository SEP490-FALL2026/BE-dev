import { Injectable } from '@nestjs/common';
import { OutOfProcessRevocationService } from '../vendor-account-review/out-of-process-revocation.service';

/**
 * What the cases outside the process say that other contexts count (`US-13-05` AC-20, AC-23): the overview of an IT Admin shows how many accounts on a
 * company asset wait to be revoked now. Reads only; the revocation itself is worked out when it is read and kept nowhere.
 */
@Injectable()
export class UsageOutOfProcessApi {
  constructor(private readonly revocations: OutOfProcessRevocationService) {}

  /** How many open cases on a company asset have the revocation due now: no Request of the person to wait for, or the ten working days passed. */
  revocationsDue(): Promise<number> {
    return this.revocations.dueCount();
  }
}
