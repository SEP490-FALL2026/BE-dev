import { Injectable } from '@nestjs/common';
import { pageOf, type Page } from '../../../core/application/pagination';
import type { BusinessDate } from '../../../core/business-date';
import { TransactionRunner, type DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../audit/public/audit.api';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import {
  BudgetCycleAlreadyOpenError,
  BudgetCycleDeadlinePassedError,
  BudgetCycleDeadlinesInvalidError,
  BudgetCycleExistsError,
  BudgetCycleLockedError,
  BudgetCycleNotDraftError,
  BudgetCycleNotFoundError,
  BudgetCycleReasonRequiredError,
  BudgetCycleYearPastError,
} from '../budget/budget.errors';
import { BudgetNotifierService } from '../budget/budget-notifier.service';
import { budgetAuditEvent, BudgetFactsService } from '../budget/budget-facts.service';
import type {
  CreateCycleBodyDto,
  CycleSummaryWire,
  CycleWire,
  ListCyclesQueryDto,
  UpdateCycleBodyDto,
} from './cycle.dto';
import {
  cycleStateOf,
  isPastYear,
  judgeDelete,
  judgeOpening,
  planCycleChange,
  type CycleChangePlan,
  type CycleState,
  type CycleUpdate,
} from './cycle.policy';
import { CycleRepo, type CycleRecord } from './cycle.repo';

type Formatter = Awaited<ReturnType<BudgetFactsService['formatter']>>;

/** The cycle as the audit record keeps it, the amounts as text. */
const auditValue = (cycle: CycleRecord) => ({
  year: cycle.year,
  submissionDeadline: cycle.submissionDeadline,
  decisionDeadline: cycle.decisionDeadline,
  annualCeilingMinor: cycle.annualCeilingMinor.toString(),
  sharedPoolReserveMinor: cycle.sharedPoolReserveMinor?.toString() ?? null,
  priorities: cycle.priorities,
});

/** What the call asks, the amounts read in the currency of the cycle. */
const updateOf = (body: UpdateCycleBodyDto, parse: (money: { amount: string }) => bigint): CycleUpdate => ({
  submissionDeadline: body.submissionDeadline,
  decisionDeadline: body.decisionDeadline,
  priorities: body.priorities,
  annualCeilingMinor: body.annualCeiling ? parse(body.annualCeiling) : undefined,
  sharedPoolReserveMinor: body.sharedPoolReserve ? parse(body.sharedPoolReserve) : undefined,
  reason: body.reason,
});

/** The columns an update writes: only what the call gave. */
const changeOf = (update: CycleUpdate) => ({
  ...(update.submissionDeadline ? { submissionDeadline: update.submissionDeadline } : {}),
  ...(update.decisionDeadline ? { decisionDeadline: update.decisionDeadline } : {}),
  ...(update.priorities !== undefined ? { priorities: update.priorities } : {}),
  ...(update.annualCeilingMinor !== undefined ? { annualCeilingMinor: update.annualCeilingMinor } : {}),
  ...(update.sharedPoolReserveMinor !== undefined ? { sharedPoolReserveMinor: update.sharedPoolReserveMinor } : {}),
});

/**
 * The budget cycle of a year (`QĐ-111z`, `QĐ-111aa`, `BR-MF4-01`, `US-06-15`): Finance makes it as a draft with the deadlines, the annual
 * ceiling and the reserve of the shared pool, opens it (the heads hear it), may move the submission deadline and change the two amounts
 * while it is open, and from the day after the submission deadline it is locked for good. There is no division of the ceiling among the
 * departments. Locks are taken in the order of the module: the cycle first, then proposal, version and year. Finance and the spending
 * approver read it.
 */
@Injectable()
export class CycleService {
  constructor(
    private readonly cycles: CycleRepo,
    private readonly facts: BudgetFactsService,
    private readonly organizationReads: OrganizationReadApi,
    private readonly notifier: BudgetNotifierService,
    private readonly audit: AuditApi,
    private readonly runner: TransactionRunner,
  ) {}

  /**
   * Makes the cycle of a year, a draft. Throws BudgetNotFinanceError, BudgetCycleYearPastError, BudgetCycleExistsError,
   * BudgetCycleDeadlinesInvalidError and the money errors.
   */
  async create(actor: AuthenticatedPrincipal, body: CreateCycleBodyDto): Promise<CycleWire> {
    this.facts.requireFinance(actor);
    const today = await this.facts.today(new Date());
    if (isPastYear(body.year, Number(today.slice(0, 4)))) throw new BudgetCycleYearPastError(body.year);
    if (body.decisionDeadline < body.submissionDeadline) throw new BudgetCycleDeadlinesInvalidError();
    const reporting = await this.facts.reportingCurrency();
    const annualCeilingMinor = await this.facts.money(body.annualCeiling, reporting);
    const sharedPoolReserveMinor = await this.facts.money(body.sharedPoolReserve, reporting);
    const organizationId = await this.facts.organizationId();

    const created = await this.runner.run(async (tx) => {
      if (await this.cycles.findByYear(organizationId, body.year, tx)) throw new BudgetCycleExistsError(body.year);
      const cycle = await this.cycles.insert(tx, {
        organizationId,
        year: body.year,
        submissionDeadline: body.submissionDeadline,
        decisionDeadline: body.decisionDeadline,
        annualCeilingMinor,
        sharedPoolReserveMinor,
        currency: reporting,
        priorities: body.priorities ?? null,
      });
      await this.audit.record(
        tx,
        budgetAuditEvent(actor, organizationId, 'BUDGET_CYCLE.CREATED', 'BudgetCycle', cycle.id, auditValue(cycle)),
      );

      return cycle;
    });

    return this.wire(created, today);
  }

  /** The cycles, the latest year first, in pages: the page and the count are cut by the database. Throws BudgetNotAReaderError. */
  async list(actor: AuthenticatedPrincipal, query: ListCyclesQueryDto): Promise<Page<CycleSummaryWire>> {
    await this.facts.requireVersionReader(actor);
    const today = await this.facts.today(new Date());
    const { items, total } = await this.cycles.page(
      await this.facts.organizationId(),
      (query.page - 1) * query.pageSize,
      query.pageSize,
    );
    const formats = new Map<string, Formatter>();
    for (const currency of new Set(items.map((item) => item.currency))) {
      formats.set(currency, await this.facts.formatter(currency));
    }

    return pageOf(
      items.map((item) => {
        const { priorities, ...summary } = this.view(item, formats.get(item.currency) as Formatter, today);
        void priorities;

        return summary;
      }),
      total,
      query.page,
      query.pageSize,
    );
  }

  /** Throws BudgetNotAReaderError and BudgetCycleNotFoundError. */
  async get(actor: AuthenticatedPrincipal, year: number): Promise<CycleWire> {
    await this.facts.requireVersionReader(actor);
    const cycle = await this.cycles.findByYear(await this.facts.organizationId(), year);
    if (!cycle) throw new BudgetCycleNotFoundError();

    return this.wire(cycle, await this.facts.today(new Date()));
  }

  /**
   * Changes a cycle by its state (`QĐ-111z`): a draft takes any change; an open one moves the submission deadline (to today or later, with the
   * reason, the heads are told) and changes the annual ceiling or the reserve (with the reason); a locked one takes none. Throws
   * BudgetNotFinanceError, BudgetCycleNotFoundError, BudgetCycleYearPastError, BudgetCycleLockedError, BudgetCycleDeadlinesInvalidError,
   * BudgetCycleDeadlinePassedError, BudgetCycleReasonRequiredError and the money errors.
   */
  async update(actor: AuthenticatedPrincipal, year: number, body: UpdateCycleBodyDto): Promise<CycleWire> {
    this.facts.requireFinance(actor);
    const organizationId = await this.facts.organizationId();
    const today = await this.facts.today(new Date());

    const updated = await this.runner.run((tx) => this.updateIn(tx, { actor, organizationId, year, today, body }));

    return this.wire(updated, today);
  }

  private async updateIn(
    tx: DbTx,
    call: {
      actor: AuthenticatedPrincipal;
      organizationId: string;
      year: number;
      today: BusinessDate;
      body: UpdateCycleBodyDto;
    },
  ): Promise<CycleRecord> {
    const { actor, organizationId, year, today, body } = call;
    const cycle = await this.cycles.lockByYear(tx, organizationId, year, 'UPDATE');
    if (!cycle) throw new BudgetCycleNotFoundError();
    if (isPastYear(year, Number(today.slice(0, 4)))) throw new BudgetCycleYearPastError(year);
    // The amounts are read in the currency the cycle was made in, not in the reporting currency of today.
    const update = updateOf(body, await this.facts.parserOf(cycle.currency, tx));
    const state = cycleStateOf(cycle, today);
    const plan = planCycleChange(state, update, cycle, today);
    if (plan.kind === 'NOTHING') return cycle;
    if (plan.kind !== 'CHANGE') throw this.refusal(plan, year);

    await this.cycles.update(tx, cycle.id, changeOf(update));
    const after = (await this.cycles.findByYear(organizationId, year, tx)) as CycleRecord;
    await this.audit.record(
      tx,
      budgetAuditEvent(
        actor,
        organizationId,
        'BUDGET_CYCLE.UPDATED',
        'BudgetCycle',
        cycle.id,
        { ...auditValue(after), reason: body.reason ?? null },
        auditValue(cycle),
      ),
    );
    if (state === 'OPEN' && plan.submissionMoved) {
      await this.notifier.cycleDeadlineMoved(
        tx,
        after,
        { submissionDeadline: after.submissionDeadline, previousSubmissionDeadline: cycle.submissionDeadline },
        await this.headsOf(tx, year, today),
      );
    }

    return after;
  }

  /** The head of each department of the year, today (none for a department nobody heads): the active departments that take effect by the end of that year. */
  private async headsOf(tx: DbTx, year: number, today: BusinessDate): Promise<(string | null)[]> {
    const heads: (string | null)[] = [];
    for (const departmentId of await this.organizationReads.getActiveDepartmentIds(year, tx)) {
      heads.push(await this.facts.currentHeadOf(departmentId, today, tx));
    }

    return heads;
  }

  /** Deletes a draft cycle. Throws BudgetNotFinanceError, BudgetCycleNotFoundError, BudgetCycleYearPastError and BudgetCycleNotDraftError. */
  async remove(actor: AuthenticatedPrincipal, year: number): Promise<{ year: number }> {
    this.facts.requireFinance(actor);
    const organizationId = await this.facts.organizationId();
    const today = await this.facts.today(new Date());

    await this.runner.run(async (tx) => {
      const cycle = await this.cycles.lockByYear(tx, organizationId, year, 'UPDATE');
      if (!cycle) throw new BudgetCycleNotFoundError();
      if (isPastYear(year, Number(today.slice(0, 4)))) throw new BudgetCycleYearPastError(year);
      if (judgeDelete(cycleStateOf(cycle, today)).kind !== 'OK') throw new BudgetCycleNotDraftError(year);
      await this.cycles.remove(tx, cycle.id);
      await this.audit.record(
        tx,
        budgetAuditEvent(
          actor,
          organizationId,
          'BUDGET_CYCLE.DELETED',
          'BudgetCycle',
          cycle.id,
          { deleted: true },
          auditValue(cycle),
        ),
      );
    });

    return { year };
  }

  /**
   * Opens a draft (`QĐ-111z`): the heads of the departments of the year hear the deadline and which form to fill in. Throws BudgetNotFinanceError,
   * BudgetCycleNotFoundError, BudgetCycleYearPastError, BudgetCycleAlreadyOpenError, BudgetCycleLockedError and BudgetCycleDeadlinePassedError.
   */
  async open(actor: AuthenticatedPrincipal, year: number): Promise<CycleWire> {
    this.facts.requireFinance(actor);
    const organizationId = await this.facts.organizationId();
    const now = new Date();
    const today = await this.facts.today(now);

    const opened = await this.runner.run(async (tx) => {
      const cycle = await this.cycles.lockByYear(tx, organizationId, year, 'UPDATE');
      if (!cycle) throw new BudgetCycleNotFoundError();
      if (isPastYear(year, Number(today.slice(0, 4)))) throw new BudgetCycleYearPastError(year);
      const verdict = judgeOpening(cycleStateOf(cycle, today), cycle.submissionDeadline, today);
      if (verdict.kind === 'LOCKED') throw new BudgetCycleLockedError(year);
      if (verdict.kind === 'ALREADY_OPEN') throw new BudgetCycleAlreadyOpenError(year);
      if (verdict.kind === 'DEADLINE_PASSED') throw new BudgetCycleDeadlinePassedError();

      await this.cycles.open(tx, cycle.id, actor.employeeId, now);
      const after = (await this.cycles.findByYear(organizationId, year, tx)) as CycleRecord;
      await this.audit.record(
        tx,
        budgetAuditEvent(actor, organizationId, 'BUDGET_CYCLE.OPENED', 'BudgetCycle', cycle.id, auditValue(after)),
      );
      await this.notifier.cycleOpened(tx, after, await this.headsOf(tx, year, today));

      return after;
    });

    return this.wire(opened, today);
  }

  private refusal(plan: Exclude<CycleChangePlan, { kind: 'CHANGE' | 'NOTHING' }>, year: number): Error {
    switch (plan.kind) {
      case 'LOCKED':
        return new BudgetCycleLockedError(year);
      case 'DEADLINES_INVALID':
        return new BudgetCycleDeadlinesInvalidError();
      case 'DEADLINE_IN_PAST':
        return new BudgetCycleDeadlinePassedError();
      case 'REASON_REQUIRED':
        return new BudgetCycleReasonRequiredError();
    }
  }

  /** The figures of a cycle as they are answered; the state and what is available are worked out from the stored figures, never stored. */
  private view(cycle: CycleRecord, format: Formatter, today: BusinessDate): CycleWire {
    const state: CycleState = cycleStateOf(cycle, today);
    const available = cycle.annualCeilingMinor - (cycle.sharedPoolReserveMinor ?? 0n);

    return {
      year: cycle.year,
      submissionDeadline: cycle.submissionDeadline,
      decisionDeadline: cycle.decisionDeadline,
      annualCeiling: format(cycle.annualCeilingMinor),
      sharedPoolReserve: cycle.sharedPoolReserveMinor === null ? null : format(cycle.sharedPoolReserveMinor),
      available: format(available > 0n ? available : 0n),
      priorities: cycle.priorities,
      status: state,
      openedAt: cycle.openedAt?.toISOString() ?? null,
    };
  }

  private async wire(cycle: CycleRecord, today: BusinessDate): Promise<CycleWire> {
    return this.view(cycle, await this.facts.formatter(cycle.currency), today);
  }
}
