import { Injectable, OnModuleInit } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import {
  TransferGraceHoldContributions,
  type TransferGraceHoldContribution,
  type TransferGraceHolding,
} from '../../requests/public/requests.extension-points';
import { TransferGraceRepo } from './transfer-grace.repo';
import { isOldRightOf } from './transfer-grace.policy';

/** The name the transfers take among the contributions of the grace. */
const TRANSFER_GRACE_HOLD = 'personnel.transfer-grace';

/**
 * Tells the requests that a right a person holds is a right from before a transfer whose grace still lasts (`QĐ-110q`, `R-49`, SPEC MF3-C.3). A person in
 * the grace may ask again, as a new request in the new department, for software they are about to lose: the request is let through the check of the
 * seat held and the limits GH-1/GH-2, and names the old right it replaces. Only the personnel context knows a grace, so the requests open an extension
 * point and this adds itself to it when the module starts (ADR-0019: a lower module that needs a higher one opens a point, the higher binds it).
 * The last day of the grace is still the grace. A right begun after the day the transfer took effect belongs to the new department and is not one.
 */
@Injectable()
export class TransferGraceHoldListener implements TransferGraceHoldContribution, OnModuleInit {
  /** The extension points this class registers with (gate extension-wiring, R1). */
  static readonly binds = [TransferGraceHoldContributions] as const;

  constructor(
    private readonly contributions: TransferGraceHoldContributions,
    private readonly graces: TransferGraceRepo,
  ) {}

  onModuleInit(): void {
    this.contributions.add(TRANSFER_GRACE_HOLD, this);
  }

  async holdingOf(
    input: Parameters<TransferGraceHoldContribution['holdingOf']>[0],
    tx?: DbTx,
  ): Promise<TransferGraceHolding | null> {
    const transfer = await this.graces.findInGraceOf(input.employeeId, input.today, tx);
    if (transfer === null) return null;

    return isOldRightOf(
      {
        effectiveOn: transfer.effectiveOn,
        pictureIds: transfer.snapshotBefore?.rights.map((r) => r.assignmentId) ?? null,
      },
      { assignmentId: input.assignmentId, effectiveFrom: input.effectiveFrom },
    )
      ? { transferId: transfer.id, assignmentId: input.assignmentId }
      : null;
  }
}
