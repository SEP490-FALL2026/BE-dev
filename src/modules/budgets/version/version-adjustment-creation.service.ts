import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../audit/public/audit.api';
import { commitmentAttachedAfter } from '../budget/budget.policy';
import { budgetAuditEvent } from '../budget/budget-facts.service';
import { CommitmentRepo } from '../budget/commitment.repo';
import { DecisionRepo } from '../budget/decision.repo';
import { VersionRepo } from '../budget/version.repo';

/** What the version made for a Cost Center that is given money before it had a budget of the year says. */
export interface AdjustmentVersionInput {
  organizationId: string;
  costCenterId: string;
  year: number;
  /** The amount the adjustment gives: the base of the version, with no reserve. */
  amountMinor: bigint;
  currency: string;
  /** Finance, who asked for the adjustment, and the day it was approved. */
  madeByEmployeeId: string;
  now: Date;
}

/**
 * The version of a Cost Center that is given money by an adjustment while it had no budget of the year (`R-48`, `INV-18`): the approved version of origin `ADJUSTMENT`, with the
 * amount as its base and no reserve, so that a commitment has a budget to be attached to and the check of a request has something to read. It is made in the transaction of the
 * approval of the adjustment, which holds the lock of the cycle and of the year of the Cost Center (the order of the module), and takes the commitments that waited for a budget.
 * The version is current as it is made: the spending approver approves the adjustment, and with it this version.
 */
@Injectable()
export class VersionAdjustmentCreationService {
  constructor(
    private readonly versions: VersionRepo,
    private readonly decisions: DecisionRepo,
    private readonly commitments: CommitmentRepo,
    private readonly audit: AuditApi,
  ) {}

  /** Makes the version and gives back its id. The caller has taken the locks and has seen that the Cost Center has no current version and none in flight. */
  async make(tx: DbTx, actor: AuthenticatedPrincipal, input: AdjustmentVersionInput): Promise<string> {
    const id = await this.versions.insert(tx, {
      organizationId: input.organizationId,
      costCenterId: input.costCenterId,
      year: input.year,
      kind: 'INITIAL',
      proposalId: null,
      basedOnVersionId: null,
      origin: 'ADJUSTMENT',
      baseMinor: input.amountMinor,
      reserveMinor: 0n,
      currency: input.currency,
      reservePercent: null,
      reserveReason: null,
      reason: null,
      createdByEmployeeId: input.madeByEmployeeId,
      now: input.now,
    });
    await this.versions.setApprovedByAdjustment(tx, id, input.madeByEmployeeId, input.now);
    await this.decisions.insert(tx, {
      organizationId: input.organizationId,
      versionId: id,
      decision: 'APPROVED',
      decidedByEmployeeId: actor.employeeId,
      deciderRole: 'SPENDING_APPROVER',
      reason: null,
      totalMinor: input.amountMinor,
      previousTotalMinor: null,
      currency: input.currency,
      decidedAt: input.now,
    });
    await this.audit.record(
      tx,
      budgetAuditEvent(actor, input.organizationId, 'BUDGET_VERSION.CREATED', 'BUDGET_VERSION', id, {
        kind: 'INITIAL',
        origin: 'ADJUSTMENT',
        costCenterId: input.costCenterId,
        year: input.year,
        totalMinor: input.amountMinor.toString(),
      }),
    );
    await this.attachWaiting(tx, input, id);

    return id;
  }

  /** The commitments of the Cost Center and year that waited for a budget are attached to the version, as they are when a version is approved (`US-06-07`). */
  private async attachWaiting(tx: DbTx, input: AdjustmentVersionInput, versionId: string): Promise<void> {
    const attached = await this.commitments.attachWaiting(tx, {
      costCenterId: input.costCenterId,
      year: input.year,
      versionId,
      now: input.now,
    });
    for (const commitment of attached) {
      await this.audit.record(tx, {
        organizationId: input.organizationId,
        actorKind: 'SYSTEM',
        action: 'BUDGET_COMMITMENT.ATTACHED',
        resourceType: 'BUDGET_COMMITMENT',
        resourceId: commitment.id,
        before: null,
        after: commitmentAttachedAfter(commitment, {
          versionId,
          costCenterId: input.costCenterId,
          year: input.year,
        }),
        correlationId: versionId,
      });
    }
  }
}
