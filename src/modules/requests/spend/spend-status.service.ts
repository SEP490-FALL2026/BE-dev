import { Injectable } from '@nestjs/common';
import { hasSpendStep } from '../access-request/access-request.policy';
import type { AccessRequestRecord, SpendStage } from '../access-request/access-request.types';
import type { BlockReason } from './budget-check.policy';
import { BudgetCheckRepo, type CheckRecord } from './budget-check.repo';
import { SpendDecisionRepo } from './spend-decision.repo';
import { SpendStepRepo } from './spend-step.repo';

/** The reasons a check of a request made before the three outcomes gave, read as the reasons they are now. */
const LEGACY_REASONS = (check: Pick<CheckRecord, 'staleCostEvidence'>): BlockReason[] =>
  check.staleCostEvidence ? ['PRICE_EXPIRED'] : ['NO_APPROVED_BUDGET'];

export interface SpendStatusView {
  stage: SpendStage;
  /** Why the request is blocked, every reason that applies; empty unless the stage is `BLOCKED`. */
  blockedReasons: BlockReason[];
  /**
   * How much the request is over what it may use, in the reporting currency: over the base when it waits for the head to confirm the
   * reserve (`RESERVE_CONFIRMATION`), over the reserve when it is blocked for being over it. Null otherwise. Never what is left.
   */
  overBy: { minor: bigint; currency: string } | null;
  /** What the spending approver wrote when they refused it. */
  refusalReason: string | null;
}

type QueuedCheck = Pick<
  CheckRecord,
  'outcome' | 'route' | 'blockReasons' | 'staleCostEvidence' | 'overBaseByMinor' | 'overByMinor' | 'currency'
>;

const status = (stage: SpendStage, rest: Partial<SpendStatusView> = {}): SpendStatusView => ({
  stage,
  blockedReasons: [],
  overBy: null,
  refusalReason: null,
  ...rest,
});

/**
 * Where a request in the queue of the head stands, from its newest check: blocked (and why), waiting for the head to confirm the reserve,
 * or not yet sent on. A check made before the three outcomes that blocked the request is read with the reasons it gave then.
 */
export function queuedStatus(check: QueuedCheck | null): SpendStatusView {
  if (check?.outcome === 'USES_RESERVE') {
    return status('RESERVE_CONFIRMATION', {
      overBy: check.overBaseByMinor === null ? null : { minor: check.overBaseByMinor, currency: check.currency },
    });
  }
  const blocked = check?.outcome === 'BLOCKED' || (check?.outcome === null && check.route === 'BLOCKED');
  if (check && blocked) {
    return status('BLOCKED', {
      blockedReasons: check.outcome === null ? LEGACY_REASONS(check) : check.blockReasons,
      overBy: check.overByMinor === null ? null : { minor: check.overByMinor, currency: check.currency },
    });
  }

  return status('NOT_SUBMITTED');
}

@Injectable()
export class SpendStatusService {
  constructor(
    private readonly checks: BudgetCheckRepo,
    private readonly steps: SpendStepRepo,
    private readonly decisions: SpendDecisionRepo,
  ) {}

  async of(request: AccessRequestRecord): Promise<SpendStatusView | null> {
    if (!hasSpendStep(request.policy)) return null;

    switch (request.state) {
      case 'AWAITING_SPEND_SUBMISSION':
        return queuedStatus(await this.checks.latest(request.id));
      case 'AWAITING_SPEND_DECISION':
        return status('WAITING_SPEND_DECISION');
      case 'WAITING_CONTROLLED':
        return (await this.steps.findOpen(request.id, 'SPEND_APPROVAL')) ? status('WAITING_SPEND_DECISION') : null;
      case 'REJECTED': {
        // A refusal of the need is the head's, and is read from the need step; this is the one of the spending approver.
        const decided = await this.decisions.latest(request.id);

        return decided?.decision === 'REJECTED' ? status('REFUSED', { refusalReason: decided.reason }) : null;
      }
      default:
        return null;
    }
  }
}
