import { Injectable } from '@nestjs/common';
import { TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import type { DecisionBodyDto, VersionWire } from '../budget/budget.dto';
import { BudgetSupportService } from '../budget/budget-support.service';
import { VersionViewService } from '../budget/version-view.service';
import { VersionDecisionJudge } from './version-decision-judge.service';
import { VersionDecisionWriter } from './version-decision-writer.service';

/**
 * The decision of the spending approver on a version of a budget (`US-06-11`): approve it, refuse it with a reason, or send
 * it back to Finance with a reason. Only the approver decides, never a version they built or sent, and nobody changes a
 * figure here (`QĐ-82f`). Approving makes the version the current budget of its Cost Center and year, replaces the one
 * that was current, and attaches the commitments of that Cost Center and year that were waiting for a budget
 * (`US-06-07`); a version that is not approved attaches nothing, and the year stays without a budget (`AC-6`). A refusal leaves
 * the proposal behind the version reviewed, so Finance can make another version from it, or the head can send a proposal that
 * follows it. The decision is written as a record that is never changed, in the transaction of the move, and nothing is
 * decided once the fiscal year has ended (`BUDGET.YEAR_ENDED`). The versions of the Cost Center and year are locked by id and
 * then the year, the order of every writer of this context.
 */
@Injectable()
export class VersionDecisionService {
  constructor(
    private readonly runner: TransactionRunner,
    private readonly views: VersionViewService,
    private readonly support: BudgetSupportService,
    private readonly judge: VersionDecisionJudge,
    private readonly writer: VersionDecisionWriter,
  ) {}

  /** Throws BudgetVersionNotFoundError, BudgetDecisionRefusedError and BudgetYearEndedError. */
  async decide(actor: AuthenticatedPrincipal, id: string, body: DecisionBodyDto): Promise<VersionWire> {
    const fiscalStart = await this.support.fiscalYearStartMonth();
    const decided = await this.runner.run(async (tx) => {
      const judged = await this.judge.judge(tx, actor, id, fiscalStart);

      return this.writer.write(tx, actor, judged, body);
    });

    // Read once the decision is committed: the view reads the record of it, which is not visible before.
    return this.views.wire(decided);
  }
}
