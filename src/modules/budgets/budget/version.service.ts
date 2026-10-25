import { Injectable } from '@nestjs/common';
import { TransactionRunner, type DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditService } from '../../audit/audit.service';
import {
  BudgetCurrentExistsError,
  BudgetNoCurrentError,
  BudgetProposalNotFoundError,
  BudgetProposalStateError,
  BudgetQuartersMismatchError,
  BudgetReasonRequiredError,
  BudgetVersionInFlightError,
  BudgetVersionNotEditableError,
  BudgetVersionNotFoundError,
  BudgetYearEndedError,
} from './budget.errors';
import { isEditable, quartersMatch, yearIsOpen } from './budget.policy';
import { budgetAuditEvent, BudgetSupportService } from './budget-support.service';
import { ProposalRepo } from './proposal.repo';
import { VersionLineRepo } from './version-line.repo';
import { VersionRepo, type VersionPatch, type VersionRecord } from './version.repo';
import { VersionViewService } from './version-view.service';
import type { RevisionBodyDto, VersionBodyDto, VersionPatchDto, VersionWire } from './budget.dto';

type Quarters = [bigint, bigint, bigint, bigint];
type QuartersBody = NonNullable<VersionBodyDto['quarters']>;

/**
 * The versions of a budget as Finance builds them (`US-06-09`): a first version made from the proposal that waits, a
 * revision of the current budget, the lines adjusted with a comment and the reason for a change, the forecast by quarter,
 * and the sending to the spending approver. Finance never edits a proposal, never makes a version current and never
 * sets a limit for a quarter: the spending approver decides, and the year is the only thing a budget limits (`QĐ-82e`).
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
    private readonly audit: AuditService,
  ) {}

  /**
   * Throws BudgetProposalNotFoundError, BudgetProposalStateError, BudgetYearEndedError, BudgetCurrentExistsError,
   * BudgetVersionInFlightError, BudgetQuartersMismatchError and the money errors.
   */
  async createFromProposal(actor: AuthenticatedPrincipal, body: VersionBodyDto): Promise<VersionWire> {
    const fiscalStart = await this.support.fiscalYearStartMonth();

    return this.runner.run(async (tx) => {
      const proposal = await this.proposals.lockById(tx, body.proposalId);
      if (!proposal) throw new BudgetProposalNotFoundError();
      if (proposal.state !== 'SUBMITTED') throw new BudgetProposalStateError('REVIEW', proposal.state);
      const today = await this.support.today(new Date(), tx);
      if (!yearIsOpen(proposal.year, today, fiscalStart)) throw new BudgetYearEndedError(proposal.year);
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

  /** Throws BudgetCostCenterNotFoundError, BudgetYearEndedError, BudgetNoCurrentError and BudgetVersionInFlightError. */
  async createRevision(actor: AuthenticatedPrincipal, body: RevisionBodyDto): Promise<VersionWire> {
    const fiscalStart = await this.support.fiscalYearStartMonth();

    return this.runner.run(async (tx) => {
      const today = await this.support.today(new Date(), tx);
      if (!yearIsOpen(body.year, today, fiscalStart)) throw new BudgetYearEndedError(body.year);
      const costCenter = await this.support.costCenter(body.costCenterId, tx);
      const current = await this.versions.current(costCenter.id, body.year, tx);
      if (!current) throw new BudgetNoCurrentError();
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

  /** Throws BudgetVersionNotFoundError, BudgetVersionNotEditableError, BudgetQuartersMismatchError and the money errors. */
  async update(actor: AuthenticatedPrincipal, id: string, patch: VersionPatchDto): Promise<VersionWire> {
    return this.runner.run(async (tx) => {
      const version = await this.editable(tx, id);
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
      await this.audit.record(
        tx,
        budgetAuditEvent(actor, version.organizationId, 'BUDGET_VERSION.UPDATED', 'BUDGET_VERSION', id, {
          fields: Object.keys(patch).join(','),
          totalMinor: total.toString(),
        }),
      );

      return this.views.wire(await this.requireIn(id, tx));
    });
  }

  /**
   * Finance sends the version to the spending approver (`US-06-09` AC-1). A revision is sent with the reason that must go
   * with it, or not at all, and the current budget stays what it is until the approver approves it (`AC-7`, `AC-8`).
   */
  async send(actor: AuthenticatedPrincipal, id: string): Promise<VersionWire> {
    const fiscalStart = await this.support.fiscalYearStartMonth();

    return this.runner.run(async (tx) => {
      const version = await this.editable(tx, id);
      const today = await this.support.today(new Date(), tx);
      if (!yearIsOpen(version.year, today, fiscalStart)) throw new BudgetYearEndedError(version.year);
      if (version.kind === 'REVISION' && !version.reason) throw new BudgetReasonRequiredError('REVISION');
      if (version.proposalId) {
        const proposal = await this.proposals.lockById(tx, version.proposalId);
        if (!proposal || (proposal.state !== 'SUBMITTED' && proposal.state !== 'REVIEWED')) {
          throw new BudgetProposalStateError('REVIEW', proposal?.state ?? 'MISSING');
        }
        await this.proposals.setReviewed(tx, proposal.id);
      }

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

      return this.views.wire(await this.requireIn(id, tx));
    });
  }

  private async requireIn(id: string, tx: DbTx): Promise<VersionRecord> {
    const version = await this.versions.findById(id, tx);
    if (!version) throw new BudgetVersionNotFoundError();

    return version;
  }

  /** The version, locked, and only if Finance may still change it. */
  private async editable(tx: DbTx, id: string): Promise<VersionRecord> {
    const version = await this.versions.lockById(tx, id);
    if (!version) throw new BudgetVersionNotFoundError();
    if (!isEditable(version.state)) throw new BudgetVersionNotEditableError(version.state);

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
