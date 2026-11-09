import type { BusinessDate } from '../../../core/business-date';
import type { ApplicationUsageEvidence } from '../../usage/public/usage-evidence.types';
import type { TransferFact } from '../../personnel/public/personnel.types';
import type { GhostSeatRecord } from '../ghost-seat/ghost-seat.types';
import type { RulePass } from '../internal-rules/internal-rules.types';
import type { SourceVerdict } from './usage-gates.policy';
import type { Thresholds } from './usage-assessment.policy';

/** What one weekly pass knows of all the seats, read once. */
export interface UsageRunContext extends RulePass {
  /** `GHOST_SEAT_NEW_ASSIGNMENT_GRACE_DAYS`. */
  graceDays: number;
  handingOver: ReadonlySet<string>;
  /** The transfer in overlap of a person, when there is one (`QĐ-90c`). */
  transfers: ReadonlyMap<string, TransferFact>;
  exemptions: ReadonlyMap<string, BusinessDate>;
  /** The recommendations about seats that are not closed, by seat chain (gate 8). */
  existing: ReadonlyMap<string, GhostSeatRecord>;
  previous: ReadonlyMap<string, { id: string; closeReason: 'KEPT' | 'EXEMPTED'; closedOn: BusinessDate }>;
}

export interface LeaveSpan {
  startedOn: BusinessDate;
  endedOn: BusinessDate | null;
}

/** What one application adds: its evidence, what the sources let the rule conclude, its thresholds, when each seat could be used and who was on leave. */
export interface UsageApplicationContext {
  applicationId: string;
  evidence: ApplicationUsageEvidence;
  verdict: SourceVerdict;
  thresholds: Thresholds;
  usableOn: ReadonlyMap<string, BusinessDate | null>;
  leaves: ReadonlyMap<string, readonly LeaveSpan[]>;
  price: (planId: string) => Promise<{
    amountMinor: bigint;
    currency: string;
    billingCycle: 'MONTHLY' | 'QUARTERLY' | 'ANNUAL' | 'OTHER';
  } | null>;
}
