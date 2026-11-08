import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../core/business-date';
import { TransactionRunner, type DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../audit/public/audit.api';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import {
  BudgetCeilingDepartmentInvalidError,
  BudgetCeilingsIncompleteError,
  BudgetCeilingsOverAnnualError,
  BudgetCycleDeadlinesInvalidError,
  BudgetCycleExistsError,
  BudgetCycleNotFoundError,
  BudgetCycleReasonRequiredError,
  BudgetCycleYearPastError,
} from '../budget/budget.errors';
import { BudgetNotifierService } from '../budget/budget-notifier.service';
import { budgetAuditEvent, BudgetFactsService } from '../budget/budget-facts.service';
import { pageOf, type Page } from '../../../core/application/pagination';
import type {
  CycleSummaryWire,
  CycleWire,
  ListCyclesQueryDto,
  OpenCycleBodyDto,
  SetCeilingsBodyDto,
  UpdateCycleBodyDto,
} from './cycle.dto';
import {
  ceilingAuditValue,
  ceilingTotal,
  changedCeilings,
  changesNumbers,
  planUpdate,
  departmentsToTell,
  isPastYear,
  judgePublish,
  leavesUnexplained,
  type PublishVerdict,
} from './cycle.policy';
import { CycleRepo, figuresOf, type CycleFigures, type CycleRecord } from './cycle.repo';

type Formatter = Awaited<ReturnType<BudgetFactsService['formatter']>>;

/**
 * The budget cycle of a year (`QĐ-103i`, `BR-MF4-01`, `BR-MF4-02`, `US-06-15`): Finance opens it, changes the annual ceiling with the
 * reason, divides the ceiling among the departments and into the shared-pool reserve, and publishes it. Locks are taken in the order
 * of the module: the cycle first, then proposal, version and year. Finance and the spending approver read it.
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

  /** The departments a division of the year is made among (`QĐ-103i`): the active ones that take effect by the end of that year. */
  ceilingDepartments(tx: DbTx, year: number): Promise<string[]> {
    return this.organizationReads.getActiveDepartmentIds(year, tx);
  }

  /** Throws BudgetNotFinanceError, BudgetCycleYearPastError, BudgetCycleExistsError, BudgetCycleDeadlinesInvalidError and the money errors. */
  async open(actor: AuthenticatedPrincipal, body: OpenCycleBodyDto): Promise<CycleWire> {
    this.facts.requireFinance(actor);
    const now = new Date();
    const today = await this.facts.today(now);
    if (isPastYear(body.year, Number(today.slice(0, 4)))) throw new BudgetCycleYearPastError(body.year);
    if (body.decisionDeadline < body.submissionDeadline) throw new BudgetCycleDeadlinesInvalidError();
    const reporting = await this.facts.reportingCurrency();
    const annualCeilingMinor = await this.facts.money(body.annualCeiling, reporting);
    const organizationId = await this.facts.organizationId();

    const created = await this.runner.run(async (tx) => {
      if (await this.cycles.findByYear(organizationId, body.year, tx)) throw new BudgetCycleExistsError(body.year);
      const cycle = await this.cycles.insert(tx, {
        organizationId,
        year: body.year,
        submissionDeadline: body.submissionDeadline,
        decisionDeadline: body.decisionDeadline,
        annualCeilingMinor,
        currency: reporting,
        priorities: body.priorities ?? null,
        openedByEmployeeId: actor.employeeId,
        openedAt: now,
      });
      await this.audit.record(
        tx,
        budgetAuditEvent(actor, organizationId, 'BUDGET_CYCLE.OPENED', 'BudgetCycle', cycle.id, {
          year: cycle.year,
          submissionDeadline: cycle.submissionDeadline,
          decisionDeadline: cycle.decisionDeadline,
          annualCeilingMinor: annualCeilingMinor.toString(),
          priorities: cycle.priorities,
        }),
      );
      const heads: (string | null)[] = [];
      for (const departmentId of await this.ceilingDepartments(tx, body.year)) {
        heads.push(await this.facts.currentHeadOf(departmentId, today, tx));
      }
      await this.notifier.cycleOpened(tx, cycle, heads);

      return cycle;
    });

    return this.wire(created);
  }

  /** The cycles, the latest year first, in pages: the page and the count are cut by the database. Throws BudgetNotAReaderError. */
  async list(actor: AuthenticatedPrincipal, query: ListCyclesQueryDto): Promise<Page<CycleSummaryWire>> {
    await this.facts.requireVersionReader(actor);
    const { items, total } = await this.cycles.page(
      await this.facts.organizationId(),
      (query.page - 1) * query.pageSize,
      query.pageSize,
    );
    const formats = new Map<string, Awaited<ReturnType<BudgetFactsService['formatter']>>>();
    for (const currency of new Set(items.map((item) => item.currency))) {
      formats.set(currency, await this.facts.formatter(currency));
    }

    return pageOf(
      items.map((item) => this.summary(item, formats.get(item.currency) as Formatter)),
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

    return this.wire(cycle);
  }

  /**
   * Changes the deadlines, the priorities and the annual ceiling (with the reason). A new annual ceiling unpublishes the cycle: it is
   * checked again when Finance publishes. Throws BudgetNotFinanceError, BudgetCycleNotFoundError, BudgetCycleYearPastError,
   * BudgetCycleDeadlinesInvalidError, BudgetCycleReasonRequiredError and the money errors.
   */
  async update(actor: AuthenticatedPrincipal, year: number, body: UpdateCycleBodyDto): Promise<CycleWire> {
    this.facts.requireFinance(actor);
    const organizationId = await this.facts.organizationId();
    const currentYear = Number((await this.facts.today(new Date())).slice(0, 4));

    const updated = await this.runner.run((tx) =>
      this.updateIn(tx, { actor, organizationId, year, currentYear, body }),
    );

    return this.wire(updated);
  }

  private async updateIn(
    tx: DbTx,
    call: {
      actor: AuthenticatedPrincipal;
      organizationId: string;
      year: number;
      currentYear: number;
      body: UpdateCycleBodyDto;
    },
  ): Promise<CycleRecord> {
    const { actor, organizationId, year, currentYear, body } = call;
    const cycle = await this.cycles.lockByYear(tx, organizationId, year, 'UPDATE');
    if (!cycle) throw new BudgetCycleNotFoundError();
    if (isPastYear(year, currentYear)) throw new BudgetCycleYearPastError(year);
    // The amount is read in the currency the cycle was opened in, not in the reporting currency of today.
    const ceiling = body.annualCeiling
      ? (await this.facts.parserOf(cycle.currency, tx))(body.annualCeiling)
      : undefined;
    const plan = planUpdate(body, cycle, ceiling);
    if (plan.decision < plan.submission) throw new BudgetCycleDeadlinesInvalidError();
    if (plan.ceilingChanged && !body.reason) throw new BudgetCycleReasonRequiredError();
    // Nothing to change: the cycle is answered as it is, with no write and no record.
    if (!plan.changes) return cycle;

    await this.cycles.update(tx, cycle.id, {
      ...(body.submissionDeadline ? { submissionDeadline: body.submissionDeadline } : {}),
      ...(body.decisionDeadline ? { decisionDeadline: body.decisionDeadline } : {}),
      ...(body.priorities !== undefined ? { priorities: body.priorities } : {}),
      ...(plan.ceilingChanged ? { annualCeilingMinor: ceiling } : {}),
      unpublish: plan.ceilingChanged,
    });
    await this.recordUpdate(tx, { actor, organizationId, ceiling, body }, cycle, {
      submission: plan.submission,
      decision: plan.decision,
      ceilingChanged: plan.ceilingChanged,
    });

    return (await this.cycles.findByYear(organizationId, year, tx)) as CycleRecord;
  }

  private recordUpdate(
    tx: DbTx,
    call: {
      actor: AuthenticatedPrincipal;
      organizationId: string;
      ceiling: bigint | undefined;
      body: UpdateCycleBodyDto;
    },
    cycle: CycleRecord,
    change: { submission: BusinessDate; decision: BusinessDate; ceilingChanged: boolean },
  ): Promise<void> {
    const { actor, organizationId, ceiling, body } = call;
    const annualCeilingMinor = change.ceilingChanged ? (ceiling as bigint) : cycle.annualCeilingMinor;

    return this.audit.record(
      tx,
      budgetAuditEvent(
        actor,
        organizationId,
        'BUDGET_CYCLE.UPDATED',
        'BudgetCycle',
        cycle.id,
        {
          submissionDeadline: change.submission,
          decisionDeadline: change.decision,
          annualCeilingMinor: annualCeilingMinor.toString(),
          priorities: body.priorities !== undefined ? body.priorities : cycle.priorities,
          reason: body.reason ?? null,
        },
        {
          submissionDeadline: cycle.submissionDeadline,
          decisionDeadline: cycle.decisionDeadline,
          annualCeilingMinor: cycle.annualCeilingMinor.toString(),
          priorities: cycle.priorities,
        },
      ),
    );
  }

  /**
   * Replaces the division of the ceiling and the shared-pool reserve; the cycle is unpublished and must be published again. Throws
   * BudgetNotFinanceError, BudgetCycleNotFoundError, BudgetCycleYearPastError, BudgetCeilingDepartmentInvalidError and the money errors.
   */
  async setCeilings(actor: AuthenticatedPrincipal, year: number, body: SetCeilingsBodyDto): Promise<CycleWire> {
    this.facts.requireFinance(actor);
    const organizationId = await this.facts.organizationId();
    const currentYear = Number((await this.facts.today(new Date())).slice(0, 4));

    const updated = await this.runner.run(async (tx) => {
      const cycle = await this.cycles.lockByYear(tx, organizationId, year, 'UPDATE');
      if (!cycle) throw new BudgetCycleNotFoundError();
      if (isPastYear(year, currentYear)) throw new BudgetCycleYearPastError(year);
      const inSet = new Set(await this.ceilingDepartments(tx, year));
      const strangers = [
        ...new Set(body.departments.map((row) => row.departmentId).filter((id) => !inSet.has(id))),
      ].sort();
      if (strangers.length > 0) throw new BudgetCeilingDepartmentInvalidError(strangers);

      // The amounts are read in the currency of the cycle, the minor unit read once.
      const parse = await this.facts.parserOf(cycle.currency, tx);
      const reserve = parse(body.sharedPoolReserve);
      const rows = body.departments.map((row) => {
        const parts = {
          departmentId: row.departmentId,
          signedCommitmentsMinor: parse(row.signedCommitments),
          plannedSeatsMinor: parse(row.plannedSeats),
          priorityMinor: parse(row.priority),
          explanation: row.explanation ?? null,
        };

        return { ...parts, totalMinor: ceilingTotal(parts) };
      });
      const changes = changedCeilings(cycle.ceilings, rows);
      const reserveChanged = reserve !== cycle.sharedPoolReserveMinor;
      // The same division again changes nothing: the cycle stays published and nothing is recorded.
      if (changes.length === 0 && !reserveChanged) return cycle;

      // A change of the explanation alone keeps the cycle published; a change of a number takes it back (R-I04), and so does a
      // division with a ceiling that has no explanation, which could not be published (W2-N4).
      const unpublish = changesNumbers(changes, reserveChanged) || leavesUnexplained(rows);
      await this.cycles.replaceCeilings(tx, cycle, reserve, rows, unpublish);
      await this.audit.record(
        tx,
        budgetAuditEvent(
          actor,
          organizationId,
          'BUDGET_CYCLE.CEILINGS_SET',
          'BudgetCycle',
          cycle.id,
          {
            sharedPoolReserveMinor: reserve.toString(),
            changes: changes.map((change) => ({
              departmentId: change.departmentId,
              before: change.before && ceilingAuditValue(change.before),
              after: change.after && ceilingAuditValue(change.after),
            })),
          },
          { sharedPoolReserveMinor: cycle.sharedPoolReserveMinor?.toString() ?? null },
        ),
      );

      return (await this.cycles.findByYear(organizationId, year, tx)) as CycleRecord;
    });

    return this.wire(updated);
  }

  /**
   * Publishes the division: every department of the year has a ceiling, the reserve is entered and the total is within the annual
   * ceiling. A refusal is recorded in the Audit Trail with its code. The heads of the departments whose total changed hear it.
   * Throws BudgetNotFinanceError, BudgetCycleNotFoundError, BudgetCycleYearPastError, BudgetCeilingsIncompleteError and
   * BudgetCeilingsOverAnnualError.
   */
  async publish(actor: AuthenticatedPrincipal, year: number): Promise<CycleWire> {
    this.facts.requireFinance(actor);
    const organizationId = await this.facts.organizationId();
    const now = new Date();
    const today = await this.facts.today(now);

    const outcome = await this.runner.run((tx) => this.publishIn(tx, { actor, organizationId, year, now, today }));

    if (outcome.kind === 'REFUSED') throw this.refusal(outcome.verdict);

    return this.wire(outcome.published);
  }

  private async publishIn(
    tx: DbTx,
    call: { actor: AuthenticatedPrincipal; organizationId: string; year: number; now: Date; today: BusinessDate },
  ): Promise<
    | { kind: 'REFUSED'; verdict: Exclude<PublishVerdict, { kind: 'OK' }> }
    | { kind: 'PUBLISHED'; published: CycleRecord }
  > {
    const { actor, organizationId, year, now, today } = call;
    const cycle = await this.cycles.lockByYear(tx, organizationId, year, 'UPDATE');
    if (!cycle) throw new BudgetCycleNotFoundError();
    if (isPastYear(year, Number(today.slice(0, 4)))) throw new BudgetCycleYearPastError(year);
    const verdict = judgePublish({
      departmentIds: await this.ceilingDepartments(tx, year),
      ceilings: cycle.ceilings,
      reserveMinor: cycle.sharedPoolReserveMinor,
      annualCeilingMinor: cycle.annualCeilingMinor,
    });
    if (verdict.kind !== 'OK') {
      await this.audit.record(
        tx,
        budgetAuditEvent(actor, organizationId, 'BUDGET_CYCLE.PUBLISH_REFUSED', 'BudgetCycle', cycle.id, {
          code: verdict.kind === 'INCOMPLETE' ? 'CEILINGS_INCOMPLETE' : 'CEILINGS_OVER_ANNUAL',
          gapMinor: verdict.kind === 'OVER_ANNUAL' ? verdict.gapMinor.toString() : null,
        }),
      );

      return { kind: 'REFUSED', verdict };
    }

    const toTell = departmentsToTell(cycle.ceilings);
    await this.cycles.publish(tx, cycle, actor.employeeId, now);
    await this.audit.record(
      tx,
      budgetAuditEvent(actor, organizationId, 'BUDGET_CYCLE.PUBLISHED', 'BudgetCycle', cycle.id, {
        year: cycle.year,
        totalMinor: verdict.totalMinor.toString(),
        departments: toTell,
      }),
    );
    for (const departmentId of toTell) {
      await this.notifier.ceilingPublished(tx, cycle, {
        departmentId,
        headEmployeeId: await this.facts.currentHeadOf(departmentId, today, tx),
        publication: now.toISOString(),
      });
    }

    return { kind: 'PUBLISHED', published: (await this.cycles.findByYear(organizationId, year, tx)) as CycleRecord };
  }

  private refusal(verdict: Exclude<PublishVerdict, { kind: 'OK' }>): Error {
    return verdict.kind === 'INCOMPLETE'
      ? new BudgetCeilingsIncompleteError(
          verdict.missingDepartmentIds,
          verdict.staleDepartmentIds,
          verdict.reserveMissing,
          verdict.explanationMissingDepartmentIds,
        )
      : new BudgetCeilingsOverAnnualError(verdict.gapMinor);
  }

  /** The figures of a cycle as they are answered; the sums come from the stored figures, never stored. */
  private summary(cycle: CycleFigures, format: Formatter): CycleSummaryWire {
    const allocated = cycle.ceilingsTotalMinor + (cycle.sharedPoolReserveMinor ?? 0n);
    const left = cycle.annualCeilingMinor - allocated;
    const status =
      cycle.publishedAt !== null
        ? 'PUBLISHED'
        : cycle.firstPublishedAt !== null
          ? 'CHANGED_AFTER_PUBLISH'
          : 'NOT_PUBLISHED';

    return {
      year: cycle.year,
      submissionDeadline: cycle.submissionDeadline,
      decisionDeadline: cycle.decisionDeadline,
      annualCeiling: format(cycle.annualCeilingMinor),
      sharedPoolReserve: cycle.sharedPoolReserveMinor === null ? null : format(cycle.sharedPoolReserveMinor),
      priorities: cycle.priorities,
      status,
      openedAt: cycle.openedAt.toISOString(),
      publishedAt: cycle.publishedAt?.toISOString() ?? null,
      firstPublishedAt: cycle.firstPublishedAt?.toISOString() ?? null,
      allocated: format(allocated),
      unallocated: format(left > 0n ? left : 0n),
    };
  }

  /** The cycle with the ceiling of each department, by the id of the department. */
  private async wire(cycle: CycleRecord): Promise<CycleWire> {
    const format = await this.facts.formatter(cycle.currency);
    const ceilings: CycleWire['ceilings'] = {};
    for (const ceiling of cycle.ceilings) {
      ceilings[ceiling.departmentId] = {
        explanation: ceiling.explanation,
        signedCommitments: format(ceiling.signedCommitmentsMinor),
        plannedSeats: format(ceiling.plannedSeatsMinor),
        priority: format(ceiling.priorityMinor),
        total: format(ceiling.totalMinor),
      };
    }

    return { ...this.summary(figuresOf(cycle), format), ceilings };
  }
}
