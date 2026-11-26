import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../../core/business-date';
import type { DbTx } from '../../../../infrastructure/database/transaction-runner';
import type { RenewalPeriodFacts } from '../../../catalog/public/subscription-period.types';
import {
  SubscriptionRenewalAutoService,
  type AutoPassedRenewalSubject,
  type CutoffLockSubject,
} from './subscription-renewal-auto.service';
import {
  SubscriptionRenewalLinesFactsService,
  type ComputedPeriodLineTargets,
} from './subscription-renewal-lines-facts.service';
import type { LineProposalDecision } from './subscription-renewal-lines.policy';
import type { LineTargetLockedBy } from './subscription-renewal-lines.types';

/**
 * Capability entry service for `subscription-renewal/lines/`: per-line need/target/shortfall computation,
 * cutoff target locking, proposal target persistence, and delegating system auto-renewal/expiry handling.
 */
@Injectable()
export class SubscriptionRenewalLinesService {
  constructor(
    private readonly reader: SubscriptionRenewalLinesFactsService,
    private readonly auto: SubscriptionRenewalAutoService,
  ) {}

  computeForPeriod(period: RenewalPeriodFacts, today: BusinessDate, tx?: DbTx): Promise<ComputedPeriodLineTargets> {
    return this.reader.computeForPeriod(period, today, tx);
  }

  lineViewsOf(period: RenewalPeriodFacts, today: BusinessDate) {
    return this.reader.lineViewsOf(period, today);
  }

  persistProposalTargets(
    tx: DbTx,
    input: {
      renewalOn: BusinessDate;
      renewalId: string;
      now: Date;
      lockedBy: LineTargetLockedBy;
      decisions: readonly LineProposalDecision[];
      autoRecorded: boolean;
      minimumTotalHolderLineId: string | null;
      minimumTotalNote: string | null;
    },
  ): Promise<void> {
    return this.reader.persistProposalTargets(tx, input);
  }

  lockCutoffIfDue(subject: CutoffLockSubject): Promise<boolean> {
    return this.auto.lockCutoffIfDue(subject);
  }

  handlePassedRenewalDay(subject: AutoPassedRenewalSubject): Promise<boolean> {
    return this.auto.handlePassedRenewalDay(subject);
  }

  targetsOfLines(lineIds: readonly string[], tx?: DbTx) {
    return this.reader.targetsOfLines(lineIds, tx);
  }
}
