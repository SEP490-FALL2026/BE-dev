import { Injectable } from '@nestjs/common';
import { TransactionRunner, type DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditService } from '../../audit/audit.service';
import {
  BudgetCurrentExistsError,
  BudgetDepartmentHasNoHeadError,
  BudgetNoCurrentError,
  BudgetProposalNotFoundError,
  BudgetProposalStateError,
  BudgetQuartersMismatchError,
  BudgetReasonRequiredError,
  BudgetVersionInFlightError,
  BudgetVersionNotFoundError,
  BudgetYearEndedError,
} from './budget.errors';
import { quartersMatch, versionSourceOf, yearHasEnded } from './budget.policy';
import { BudgetNotifierService } from './budget-notifier.service';
import { budgetAuditEvent, BudgetSupportService } from './budget-support.service';
import { BudgetYearLockRepo } from './budget-year-lock.repo';
import { ProposalRepo } from './proposal.repo';
import { VersionAccessService } from './version-access.service';
import { VersionHistoryService } from './version-history.service';
import { VersionLineRepo } from './version-line.repo';
import { VersionRepo, type VersionPatch, type VersionRecord } from './version.repo';
import { VersionViewService } from './version-view.service';
import type { RevisionBodyDto, VersionBodyDto, VersionPatchDto, VersionWire } from './budget.dto';

type Quarters = [bigint, bigint, bigint, bigint];
type QuartersBody = NonNullable<VersionBodyDto['quarters']>;

/**
 * The versions of a budget as Finance builds them (`US-06-09`): a first version made from the proposal that waits (or made again
 * from a proposal whose version was refused), a revision of the current budget, the figures and the reason for a change, the
 * forecast by quarter, and the sending to the spending approver. Finance never edits a proposal, never makes a version current and
 * never sets a limit for a quarter: the spending approver decides, and the year is the only thing a budget limits (`QĐ-82e`).
 * Every edit leaves its history (F66); a version of a year that has ended is not changed (F62).
 */
@Injectable()
export class VersionService {
  constructor(
    private readonly runner: TransactionRunner,
    private readonly versions: VersionRepo,
    private readonly lines: VersionLineRepo,
    private readonly proposals: ProposalRepo,
    private readonly views: VersionViewService,
    private readonly support: BudgetSupportService,
    private readonly access: VersionAccessService,
    private readonly history: VersionHistoryService,
    private readonly notifier: BudgetNotifierService,
    private readonly yearLock: BudgetYearLockRepo,
    private readonly audit: AuditService,
  ) {}

  /**
   * Throws BudgetNotFinanceError, BudgetProposalNotFoundError, FinanceSetupIncompleteError, BudgetYearEndedError,
   * BudgetProposalStateError, BudgetCurrentExistsError, BudgetVersionInFlightError, BudgetQuartersMismatchError and the money errors.
   */
  async createFromProposal(actor: AuthenticatedPrincipal, body: VersionBodyDto): Promise<VersionWire> {
    this.support.requireFinance(actor);
    const fiscalStart = await this.support.fiscalYearStartMonth();

    return this.runner.run(async (tx) => {
      // The proposal row is locked first, as the head's successor and the sending of a version lock it, so they queue (F63).
      const proposal = await this.proposals.lockById(tx, body.proposalId);
      if (!proposal) throw new BudgetProposalNotFoundError();
      await this.support.costCenterInUse(proposal.costCenterId, tx);
      const today = await this.support.today(new Date(), tx);
      if (yearHasEnded(proposal.year, today, fiscalStart)) throw new BudgetYearEndedError(proposal.year);
      const latest = await this.versions.latestOfProposal(proposal.id, tx);
      const source = versionSourceOf(proposal, latest?.state ?? null);
      if (source === null) throw new BudgetProposalStateError('REVIEW', proposal.state);
      await this.yearLock.lock(tx, proposal.costCenterId, [proposal.year]);
      if (await this.versions.current(proposal.costCenterId, proposal.year, tx)) throw new BudgetCurrentExistsError();
      if (await this.versions.inFlight(proposal.costCenterId, proposal.year, tx))
        throw new BudgetVersionInFlightError();

      const figures = await this.figures(tx, proposal.currency, body);
      const lines = (await this.proposals.allLines(proposal.id, tx)).map((line) => ({
        proposalId: proposal.id,
        proposalPosition: line.position,
        description: line.description,
        planId: line.planId,
        seats: line.seats,
        amountMinor: line.amountMinor,
        windowFrom: line.windowFrom,
        windowTo: line.windowTo,
        servicePeriodMonths: line.servicePeriodMonths,
        repeatCycle: line.repeatCycle,
        quoteValidUntil: line.quoteValidUntil,
        financeComment: null,
        adjustmentReason: null,
      }));

      const id = await this.versions.insert(tx, {
        organizationId: proposal.organizationId,
        costCenterId: proposal.costCenterId,
        year: proposal.year,
        kind: 'INITIAL',
        proposalId: proposal.id,
        basedOnVersionId: null,
        rejectedPredecessorId: source === 'AFTER_REFUSAL' ? (latest?.id ?? null) : null,
        ...figures,
        currency: proposal.currency,
        reason: null,
        createdByEmployeeId: actor.employeeId,
        now: new Date(),
        lines,
      });
      await this.recordCreated(tx, actor, proposal.organizationId, id, 'INITIAL', proposal.costCenterId, proposal.year);

      return this.views.wire(await this.requireIn(id, tx));
    });
  }

  /**
   * Throws BudgetNotFinanceError, BudgetCostCenterNotFoundError, FinanceSetupIncompleteError, BudgetYearEndedError,
   * BudgetNoCurrentError, BudgetDepartmentHasNoHeadError and BudgetVersionInFlightError.
   */
  async createRevision(actor: AuthenticatedPrincipal, body: RevisionBodyDto): Promise<VersionWire> {
    this.support.requireFinance(actor);
    const fiscalStart = await this.support.fiscalYearStartMonth();

    return this.runner.run(async (tx) => {
      const costCenter = await this.support.costCenterInUse(body.costCenterId, tx);
      const today = await this.support.today(new Date(), tx);
      if (yearHasEnded(body.year, today, fiscalStart)) throw new BudgetYearEndedError(body.year);
      await this.yearLock.lock(tx, costCenter.id, [body.year]);
      const current = await this.versions.current(costCenter.id, body.year, tx);
      if (!current) throw new BudgetNoCurrentError();
      // A revision is begun only while somebody heads the department; one begun or sent before that goes on (F64, `QĐ-92d(1)`).
      if ((await this.support.currentHeadOf(costCenter.departmentId, today, tx)) === null) {
        throw new BudgetDepartmentHasNoHeadError(costCenter.departmentId);
      }
      if (await this.versions.inFlight(costCenter.id, body.year, tx)) throw new BudgetVersionInFlightError();

      const figures = await this.figures(
        tx,
        current.currency,
        {
          base: body.base,
          reserve: body.reserve,
          highValuePercent: body.highValuePercent,
          highValueAmount: body.highValueAmount,
          quarters: body.quarters,
        },
        current,
      );
      const lines = (await this.lines.allLines(current.id, tx)).map((line) => ({
        proposalId: line.proposalId,
        proposalPosition: line.proposalPosition,
        description: line.description,
        planId: line.planId,
        seats: line.seats,
        amountMinor: line.amountMinor,
        windowFrom: line.windowFrom,
        windowTo: line.windowTo,
        servicePeriodMonths: line.servicePeriodMonths,
        repeatCycle: line.repeatCycle,
        quoteValidUntil: line.quoteValidUntil,
        financeComment: null,
        adjustmentReason: null,
      }));
      const id = await this.versions.insert(tx, {
        organizationId: current.organizationId,
        costCenterId: current.costCenterId,
        year: current.year,
        kind: 'REVISION',
        proposalId: null,
        basedOnVersionId: current.id,
        ...figures,
        currency: current.currency,
        reason: body.reason ?? null,
        createdByEmployeeId: actor.employeeId,
        now: new Date(),
        lines,
      });
      await this.recordCreated(tx, actor, current.organizationId, id, 'REVISION', current.costCenterId, current.year);

      return this.views.wire(await this.requireIn(id, tx));
    });
  }

  /**
   * Throws BudgetNotFinanceError, BudgetVersionNotFoundError, BudgetYearEndedError, BudgetVersionNotEditableError,
   * BudgetReasonRequiredError, BudgetQuartersMismatchError and the money errors.
   */
  async update(actor: AuthenticatedPrincipal, id: string, patch: VersionPatchDto): Promise<VersionWire> {
    this.support.requireFinance(actor);
    const fiscalStart = await this.support.fiscalYearStartMonth();

    return this.runner.run(async (tx) => {
      const version = await this.access.lockEditable(tx, id, fiscalStart);
      // The reason of a revision is what lets it be sent; it is changed, never taken away.
      if (patch.reason === null && version.kind === 'REVISION') throw new BudgetReasonRequiredError('REVISION');
      const reporting = version.currency;
      const next: VersionPatch = {};
      if (patch.base) next.baseMinor = await this.support.money(patch.base, reporting, tx);
      if (patch.reserve) next.reserveMinor = await this.support.money(patch.reserve, reporting, tx);
      if (patch.highValuePercent !== undefined) next.highValuePercent = patch.highValuePercent;
      if (patch.highValueAmount !== undefined) {
        next.highValueAmountMinor =
          patch.highValueAmount === null
            ? null
            : await this.support.positiveMoney(patch.highValueAmount, reporting, tx);
      }
      if (patch.quarters !== undefined) next.quarters = await this.quarters(tx, patch.quarters, reporting);
      if (patch.reason !== undefined) next.reason = patch.reason;

      const total = (next.baseMinor ?? version.baseMinor) + (next.reserveMinor ?? version.reserveMinor);
      const quarters = next.quarters === undefined ? version.quarters : next.quarters;
      if (quarters && !quartersMatch(total, quarters)) throw new BudgetQuartersMismatchError();

      await this.versions.patch(tx, id, next);
      const edited = await this.requireIn(id, tx);
      const change = await this.history.figuresEdited(tx, actor, version, version, edited);
      await this.audit.record(
        tx,
        budgetAuditEvent(
          actor,
          version.organizationId,
          'BUDGET_VERSION.UPDATED',
          'BUDGET_VERSION',
          id,
          { ...(change?.after ?? {}) },
          { ...(change?.before ?? {}) },
        ),
      );

      return this.views.wire(edited);
    });
  }

  /**
   * Finance sends the version to the spending approver (`US-06-09` AC-1). A revision is sent with the reason that must go
   * with it, or not at all, and the current budget stays what it is until the approver approves it (`AC-7`, `AC-8`). A draft that a
   * withdrawn or given-back proposal left behind is not sent (F36).
   */
  async send(actor: AuthenticatedPrincipal, id: string): Promise<VersionWire> {
    this.support.requireFinance(actor);
    const fiscalStart = await this.support.fiscalYearStartMonth();

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
      await this.audit.record(
        tx,
        budgetAuditEvent(actor, version.organizationId, 'BUDGET_VERSION.SENT', 'BUDGET_VERSION', id, {
          costCenterId: version.costCenterId,
          year: version.year,
          kind: version.kind,
          totalMinor: version.totalMinor.toString(),
        }),
      );
      const sent = await this.requireIn(id, tx);
      await this.notifier.versionSent(tx, sent, proposal?.submittedByEmployeeId ?? null);

      return this.views.wire(sent);
    });
  }

  private async requireIn(id: string, tx: DbTx): Promise<VersionRecord> {
    const version = await this.versions.findById(id, tx);
    if (!version) throw new BudgetVersionNotFoundError();

    return version;
  }

  private async figures(
    tx: DbTx,
    currency: string,
    input: {
      base: { amount: string; currency: string } | undefined;
      reserve: { amount: string; currency: string } | undefined;
      highValuePercent: number | undefined;
      highValueAmount?: { amount: string; currency: string } | null | undefined;
      quarters?: QuartersBody | null | undefined;
    },
    fallback?: VersionRecord,
  ) {
    const baseMinor = input.base ? await this.support.money(input.base, currency, tx) : (fallback?.baseMinor ?? 0n);
    const reserveMinor = input.reserve
      ? await this.support.money(input.reserve, currency, tx)
      : (fallback?.reserveMinor ?? 0n);
    const quarters = input.quarters ? await this.quarters(tx, input.quarters, currency) : null;
    if (quarters && !quartersMatch(baseMinor + reserveMinor, quarters)) throw new BudgetQuartersMismatchError();

    return {
      baseMinor,
      reserveMinor,
      highValuePercent: input.highValuePercent ?? fallback?.highValuePercent ?? 0,
      highValueAmountMinor:
        input.highValueAmount === undefined
          ? (fallback?.highValueAmountMinor ?? null)
          : input.highValueAmount === null
            ? null
            : await this.support.positiveMoney(input.highValueAmount, currency, tx),
      quarters,
    };
  }

  private async quarters(tx: DbTx, input: QuartersBody | null, currency: string): Promise<Quarters | null> {
    if (input === null) return null;

    return [
      await this.support.money(input.q1, currency, tx),
      await this.support.money(input.q2, currency, tx),
      await this.support.money(input.q3, currency, tx),
      await this.support.money(input.q4, currency, tx),
    ];
  }

  private async recordCreated(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    organizationId: string,
    id: string,
    kind: 'INITIAL' | 'REVISION',
    costCenterId: string,
    year: number,
  ): Promise<void> {
    await this.audit.record(
      tx,
      budgetAuditEvent(actor, organizationId, 'BUDGET_VERSION.CREATED', 'BUDGET_VERSION', id, {
        kind,
        costCenterId,
        year,
      }),
    );
  }
}
