import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../audit/public/audit.api';
import { BudgetsApi } from '../../budgets/public/budgets.api';
import { accessRequestAuditEvent } from '../access-request/access-request-audit-event.mapper';
import type { AccessRequestRecord } from '../access-request/access-request.types';
import type { LineRecord } from '../access-request/group-request.types';
import { RequestOutcomeService } from '../outcome/request-outcome.service';
import { shareToRelease } from '../spend/line-allocation.policy';
import { GroupResolutionService } from './group-resolution.service';
import { releasedByYear, withdrawalAuditOf, type Withdrawn } from './group-withdrawal.policy';
import { LineAmountRepo } from './line-amount.repo';

/**
 * What follows the withdrawal of the people of a group in the same transaction (`US-05-08`, `US-06-14` AC-14): the money they hold
 * goes back to the budget once for all of them, each line is recorded in the Audit Trail, the line of a person who was withdrawn ends for
 * them without a grant, and the request follows its lines.
 */
@Injectable()
export class GroupWithdrawalAftermath {
  constructor(
    private readonly amounts: LineAmountRepo,
    private readonly budgets: BudgetsApi,
    private readonly audit: AuditApi,
    private readonly outcomes: RequestOutcomeService,
    private readonly resolution: GroupResolutionService,
  ) {}

  /** Gives back what the people hold, once for all of them, says what happened to each and lets the request follow its lines. */
  async after(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    request: AccessRequestRecord,
    withdrawn: readonly { line: LineRecord; done: Withdrawn }[],
    why: { reason: string | null; release: 'PARTICIPANT_WITHDRAWN' | 'REQUEST_WITHDRAWN'; now: Date },
  ): Promise<void> {
    const { now } = why;
    const toRelease = withdrawn.filter((entry) => entry.done.kind === 'ENDED' && entry.done.released);
    const shares: { year: number; amountMinor: bigint }[][] = [];
    for (const entry of toRelease) {
      shares.push(shareToRelease(await this.amounts.of(request.id, entry.line.employeeId, tx)));
    }
    const amounts = releasedByYear(shares);
    if (amounts.length > 0) {
      await this.budgets.releaseForRequest(tx, { requestId: request.id, reason: why.release, amounts, now });
      for (const entry of toRelease) await this.amounts.markReleased(tx, request.id, entry.line.employeeId, now);
    }

    for (const { line, done } of withdrawn) {
      const recorded = withdrawalAuditOf(request, line, done, {
        actorEmployeeId: actor.employeeId,
        reason: why.reason,
      });
      await this.audit.record(
        tx,
        accessRequestAuditEvent(
          actor,
          request.organizationId,
          recorded.action,
          'ACCESS_REQUEST',
          request.id,
          recorded.detail,
        ),
      );
      // The line of a person who was withdrawn ended for them without a grant; one that waits for the IT Admin has not ended yet.
      if (done.kind === 'ENDED') await this.outcomes.ended(tx, request, [line.employeeId], now);
    }
    await this.resolution.resolve(tx, actor, request.id, now);
  }
}
