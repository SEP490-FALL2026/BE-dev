import { Injectable } from '@nestjs/common';
import { TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import {
  BudgetProposalStateError,
  BudgetReasonRequiredError,
  BudgetVersionNotFoundError,
} from '../budget/budget.errors';
import { BudgetYearLockRepo } from '../budget/budget-year-lock.repo';
import { ProposalRepo } from '../budget/proposal.repo';
import { VersionRepo } from '../budget/version.repo';
import { VersionViewService } from '../budget/version-view.service';
import type { VersionPatchDto, VersionWire } from '../budget/budget.dto';
import { VersionAccessService } from './version-access.service';
import { VersionFigures } from './version-figures.service';
import { VersionTrail } from './version-trail.service';

/**
 * The edit and the sending of a version as Finance builds it (`US-06-09`): the figures and the reason for a change, the forecast by
 * quarter, and the sending to the spending approver. Finance never makes a version current and never sets a limit for a quarter: the
 * spending approver decides, and the year is the only thing a budget limits (`QĐ-82e`). Every edit leaves its history; a version of
 * a year that has ended is not changed.
 */
@Injectable()
export class VersionService {
  constructor(
    private readonly runner: TransactionRunner,
    private readonly versions: VersionRepo,
    private readonly proposals: ProposalRepo,
    private readonly views: VersionViewService,
    private readonly access: VersionAccessService,
    private readonly yearLock: BudgetYearLockRepo,
    private readonly figures: VersionFigures,
    private readonly trail: VersionTrail,
  ) {}

  /**
   * Throws BudgetNotFinanceError, BudgetVersionNotFoundError, BudgetYearEndedError, BudgetVersionNotEditableError,
   * BudgetReasonRequiredError, BudgetQuartersMismatchError and the money errors.
   */
  async update(actor: AuthenticatedPrincipal, id: string, patch: VersionPatchDto): Promise<VersionWire> {
    const fiscalStart = await this.access.begin(actor);

    return this.runner.run(async (tx) => {
      const version = await this.access.lockEditable(tx, id, fiscalStart);
      const next = await this.figures.patchOf(tx, version, patch);

      await this.versions.patch(tx, id, next);
      const edited = await this.access.requireIn(tx, id);
      await this.trail.updated(tx, actor, version, edited);

      return this.views.wire(edited);
    });
  }

  /**
   * Finance sends the version to the spending approver (`US-06-09` AC-1). A revision is sent with the reason that must go
   * with it, or not at all, and the current budget stays what it is until the approver approves it (`AC-7`, `AC-8`). A draft that a
   * withdrawn or given-back proposal left behind is not sent.
   */
  async send(actor: AuthenticatedPrincipal, id: string): Promise<VersionWire> {
    const fiscalStart = await this.access.begin(actor);

    return this.runner.run(async (tx) => {
      // The proposal row first, then the version row, then the year: the order every writer of this context takes them in.
      const known = await this.versions.findById(id, tx);
      if (!known) throw new BudgetVersionNotFoundError();
      const proposal = known.proposalId ? await this.proposals.lockById(tx, known.proposalId) : null;
      const version = await this.access.lockEditable(tx, id, fiscalStart);
      if (version.kind === 'REVISION' && !version.reason) throw new BudgetReasonRequiredError('REVISION');
      if (version.proposalId && (!proposal || (proposal.state !== 'SUBMITTED' && proposal.state !== 'REVIEWED'))) {
        throw new BudgetProposalStateError('REVIEW', proposal?.state ?? 'MISSING');
      }
      await this.yearLock.lock(tx, version.costCenterId, [version.year]);
      if (proposal) await this.proposals.setReviewed(tx, proposal.id);

      await this.versions.setSent(tx, id, actor.employeeId, new Date());
      const sent = await this.access.requireIn(tx, id);
      await this.trail.sent(tx, actor, version, { record: sent, proposal });

      return this.views.wire(sent);
    });
  }
}
