import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { IdentityAccessApi } from '../../identity-access/public/identity-access.api';
import { isLegacyStep, type LegacyCandidate } from './reassignment.policy';

/**
 * Whether the step a person is about to decide is of the rule before `QĐ-93` and so frozen until the conversion command moves it
 * (`QĐ-93k(2)`, `isLegacyStep`): the one reading the four routes that decide a step share, so a decision and the sweep agree on what is
 * frozen. A need step is read from its own row and reason; a spend step needs the history of the grant of its holder — has this person
 * ever had a `SPENDING_APPROVER` grant, revoked or not — read in the transaction of the decision (an unlocked read).
 */
@Injectable()
export class StepFreezeService {
  constructor(private readonly identity: IdentityAccessApi) {}

  async awaitsConversion(tx: DbTx, step: LegacyCandidate): Promise<boolean> {
    const holder = step.assigneeEmployeeId;
    if (step.kind !== 'SPEND_APPROVAL' || step.state !== 'PENDING' || holder === null) {
      return isLegacyStep(step, new Set());
    }

    return isLegacyStep(step, await this.identity.everHeldSpendingApproverAmong(tx, [holder]));
  }
}
