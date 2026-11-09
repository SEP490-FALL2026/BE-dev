import { Injectable } from '@nestjs/common';
import { formatAmount } from '../../../core/money/money';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { CatalogApi } from '../../catalog/public/catalog.api';
import { NeedDecisionQueueRepo, type NeedQueueRow } from '../need-decision-queue/need-decision-queue.repo';
import { SpendStepRepo } from '../spend/spend-step.repo';
import { SpendWireViewService } from '../spend/spend-wire-view.service';
import { AI_SOURCE_REASON_LENGTH, type AiSourceStep } from './requests.types';

type SpendRow = Awaited<ReturnType<SpendStepRepo['firstGivenOpenSpendOf']>>['rows'][number];

/** A step of either queue as the summary reads it, before the name of its software and of its person are looked up. */
interface SourceRow {
  stepId: string;
  requestId: string;
  stepKind: AiSourceStep['stepKind'];
  assignedAt: Date;
  planId: string | null;
  proposedName: string | null;
  /** The one person the request is for; null for a request for a group. */
  beneficiaryId: string | null;
  /** The people on the step of a request for a group, as its queue counts them; null for a request for one person. */
  groupSize: number | null;
  reason: string;
  termMonths: number;
  price: { minor: bigint; currency: string } | null;
}

/** The application of each plan, the full name of each person and the minor digits of each currency, by id or code. */
interface SourceLookups {
  applications: ReadonlyMap<string, string>;
  names: ReadonlyMap<string, string>;
  units: ReadonlyMap<string, number>;
}

/** A pending step always has the person it was given to and when (the database refuses one without): say which step when it has not. */
function givenAt(step: { id: string; assignedAt: Date | null }): Date {
  if (step.assignedAt === null) throw new Error(`The pending step ${step.id} was never given to anybody.`);

  return step.assignedAt;
}

function fromNeedRow(row: NeedQueueRow): SourceRow {
  const { request } = row;
  const group = request.type === 'GROUP_GRANT';

  return {
    stepId: row.id,
    requestId: row.requestId,
    stepKind: 'NEED_APPROVAL',
    assignedAt: givenAt(row),
    planId: request.planId,
    proposedName: request.proposal?.softwareName ?? null,
    beneficiaryId: group ? null : (request.beneficiaries[0]?.employeeId ?? null),
    // The step of a head holds the people of the group still waiting on it, as the queue of the need steps counts them.
    groupSize: group ? row._count.lines : null,
    reason: request.businessReason,
    termMonths: request.termMonths ?? 0,
    price: null,
  };
}

function fromSpendRow(row: SpendRow): SourceRow {
  const { request } = row;
  const group = request.type === 'GROUP_GRANT';

  return {
    stepId: row.id,
    requestId: row.requestId,
    stepKind: 'SPEND_APPROVAL',
    assignedAt: givenAt(row),
    planId: request.planId,
    proposedName: request.proposal?.softwareName ?? null,
    beneficiaryId: group ? null : (request.beneficiaries[0]?.employeeId ?? null),
    groupSize: group ? request._count.beneficiaries : null,
    reason: request.businessReason,
    termMonths: request.termMonths ?? 0,
    price:
      request.amountMinor === null || request.amountCurrency === null
        ? null
        : { minor: request.amountMinor, currency: request.amountCurrency },
  };
}

/** The earliest given first; the step id breaks a tie, in the order PostgreSQL sorts a uuid (its lowercase text). */
function byGivenOrder(a: SourceRow, b: SourceRow): number {
  const byTime = a.assignedAt.getTime() - b.assignedAt.getTime();
  if (byTime !== 0) return byTime;

  return a.stepId < b.stepId ? -1 : a.stepId > b.stepId ? 1 : 0;
}

/** A step points at a record that is missing only when the data is broken: say which step, never answer a half row. */
function found<T>(value: T | undefined, row: SourceRow): T {
  if (value === undefined) throw new Error(`The step ${row.stepId} points at a missing record.`);

  return value;
}

function stepOf(row: SourceRow, lookups: SourceLookups): AiSourceStep {
  const units = row.price === null ? undefined : lookups.units.get(row.price.currency);

  return {
    stepId: row.stepId,
    requestId: row.requestId,
    stepKind: row.stepKind,
    assignedAt: row.assignedAt,
    softwareName: row.proposedName ?? found(lookups.applications.get(row.planId ?? ''), row),
    beneficiaryDisplayName:
      row.groupSize === null ? found(lookups.names.get(row.beneficiaryId ?? ''), row) : `Nhóm ${row.groupSize} người`,
    // By character (code point), never inside one: the reader counts characters the same way.
    reason: [...row.reason].slice(0, AI_SOURCE_REASON_LENGTH).join(''),
    termMonths: row.termMonths,
    estimatedCost:
      row.price === null ? null : { amount: formatAmount(row.price.minor, units ?? 2), currency: row.price.currency },
  };
}

/**
 * What the summary of the queue of a person reads of the requests context (`US-15-05`): the need steps and the spend steps that wait
 * for them now, and whether the steps of a summary still do. It reads them through the filters of the two queues the person reads by
 * hand (`need-decision-queue`, the queue of the spending approver), so it agrees with them step for step: the step given to the
 * person and pending (a need step only of a request that is not theirs); a step decided, closed with its request or given to somebody
 * else is gone from the next read. It carries no deadline, no holder and no figure of a budget. Nothing it reads is changed by reading it.
 */
@Injectable()
export class RequestsAiSourceApi {
  constructor(
    private readonly needSteps: NeedDecisionQueueRepo,
    private readonly spendSteps: SpendStepRepo,
    private readonly catalog: CatalogApi,
    private readonly wireView: SpendWireViewService,
  ) {}

  /**
   * The first `limit` steps that wait for the person, the earliest given first (the step id breaks a tie), and how many wait in all.
   * Each queue is read up to `limit`, which is enough for the first `limit` of the two together.
   */
  async openStepsHeldBy(
    employeeId: string,
    limit: number,
    tx?: DbTx,
  ): Promise<{ steps: AiSourceStep[]; total: number }> {
    if (!Number.isInteger(limit) || limit < 0) throw new RangeError(`The limit ${limit} is not a count of steps.`);
    // One statement at a time on the client of a transaction.
    const need = await this.needSteps.firstGivenOpenOf(employeeId, limit, tx);
    const spend = await this.spendSteps.firstGivenOpenSpendOf(employeeId, limit, tx);
    const rows = [...need.rows.map(fromNeedRow), ...spend.rows.map(fromSpendRow)].sort(byGivenOrder).slice(0, limit);
    const lookups = await this.lookupsFor(rows);

    return { steps: rows.map((row) => stepOf(row, lookups)), total: need.total + spend.total };
  }

  /** Which of the steps still wait for the person: open and given to them now, by the filters of the two queues. */
  async stillHeldBy(employeeId: string, stepIds: readonly string[], tx?: DbTx): Promise<ReadonlySet<string>> {
    const need = await this.needSteps.openAmong(employeeId, stepIds, tx);
    const spend = await this.spendSteps.openSpendAmong(employeeId, stepIds, tx);

    return new Set([...need, ...spend]);
  }

  /** The names the steps are read against, one read of each whatever the number of steps. */
  private async lookupsFor(rows: readonly SourceRow[]): Promise<SourceLookups> {
    if (rows.length === 0) return { applications: new Map(), names: new Map(), units: new Map() };
    const planIds = [
      ...new Set(rows.flatMap((row) => (row.proposedName === null && row.planId !== null ? [row.planId] : []))),
    ];
    const [plans, people, units] = await Promise.all([
      planIds.length === 0 ? Promise.resolve([]) : this.catalog.getPlanSummaries(planIds),
      this.wireView.people(rows.map((row) => row.beneficiaryId)),
      this.wireView.units(rows.map((row) => row.price?.currency ?? null)),
    ]);

    return {
      applications: new Map(plans.map((plan) => [plan.planId, plan.applicationName])),
      names: new Map([...people].map(([id, person]) => [id, person.fullName])),
      units,
    };
  }
}
