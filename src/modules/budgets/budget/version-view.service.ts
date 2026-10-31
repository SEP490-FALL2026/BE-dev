import { Injectable } from '@nestjs/common';
import { Page, pageOf } from '../../../core/application/pagination';
import type { BusinessDate } from '../../../core/business-date';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { BudgetCostCenterNotFoundError, BudgetLineNotFoundError, BudgetVersionNotFoundError } from './budget.errors';
import { isOverdue } from './budget.policy';
import { BudgetSupportService } from './budget-support.service';
import { DecisionRepo, type DecisionRecord } from './decision.repo';
import { VersionLineRepo, type LineChangeRecord, type VersionLineRecord } from './version-line.repo';
import { VersionRepo, type VersionRecord, type VersionState } from './version.repo';
import type { LineChangeWire, VersionLineWire, VersionSummaryWire, VersionWire } from './budget.dto';

/** A version and its lines as a reader sees them: amounts in the currency of the version, people and Cost Centers by name. */
@Injectable()
export class VersionViewService {
  constructor(
    private readonly versions: VersionRepo,
    private readonly lineRepo: VersionLineRepo,
    private readonly decisions: DecisionRepo,
    private readonly support: BudgetSupportService,
  ) {}

  async require(id: string): Promise<VersionRecord> {
    const version = await this.versions.findById(id);
    if (!version) throw new BudgetVersionNotFoundError();

    return version;
  }

  async get(actor: AuthenticatedPrincipal, id: string): Promise<VersionWire> {
    await this.support.requireVersionReader(actor);

    return this.wire(await this.require(id));
  }

  async list(
    actor: AuthenticatedPrincipal,
    query: { state?: VersionState; year?: number; page: number; pageSize: number },
  ): Promise<Page<VersionSummaryWire>> {
    await this.support.requireVersionReader(actor);
    const { items, total } = await this.versions.page({
      ...(query.state ? { state: query.state } : {}),
      ...(query.year ? { year: query.year } : {}),
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    });

    return pageOf((await this.wires(items)).map(summaryOf), total, query.page, query.pageSize);
  }

  async lines(
    actor: AuthenticatedPrincipal,
    id: string,
    query: { page: number; pageSize: number },
  ): Promise<Page<VersionLineWire>> {
    await this.support.requireVersionReader(actor);
    const version = await this.require(id);
    const { items, total } = await this.lineRepo.pageLines(id, (query.page - 1) * query.pageSize, query.pageSize);

    return pageOf(await this.lineWires(version.currency, items), total, query.page, query.pageSize);
  }

  async changes(
    actor: AuthenticatedPrincipal,
    id: string,
    position: number,
    query: { page: number; pageSize: number },
  ): Promise<Page<LineChangeWire>> {
    await this.support.requireVersionReader(actor);
    await this.require(id);
    if (!(await this.lineRepo.findLine(id, position))) throw new BudgetLineNotFoundError();
    const { items, total } = await this.lineRepo.pageLineChanges(
      id,
      position,
      (query.page - 1) * query.pageSize,
      query.pageSize,
    );
    const people = await this.support.people(items.map((change) => change.changedByEmployeeId));

    return pageOf(
      items.map((change) => toChangeWire(change, people.get(change.changedByEmployeeId) ?? null)),
      total,
      query.page,
      query.pageSize,
    );
  }

  async lineWire(version: VersionRecord, line: VersionLineRecord): Promise<VersionLineWire> {
    return (await this.lineWires(version.currency, [line]))[0];
  }

  async lineWires(currency: string, lines: readonly VersionLineRecord[]): Promise<VersionLineWire[]> {
    const money = await this.support.formatter(currency);
    const today: BusinessDate = await this.support.today(new Date());

    return lines.map((line) => ({
      position: line.position,
      proposalPosition: line.proposalPosition,
      description: line.description,
      planId: line.planId,
      seats: line.seats,
      amount: money(line.amountMinor),
      windowFrom: line.windowFrom,
      windowTo: line.windowTo,
      servicePeriodMonths: line.servicePeriodMonths,
      repeatCycle: line.repeatCycle,
      quoteValidUntil: line.quoteValidUntil,
      financeComment: line.financeComment,
      adjustmentReason: line.adjustmentReason,
      overdue: isOverdue(line, today),
    }));
  }

  async wire(version: VersionRecord): Promise<VersionWire> {
    return (await this.wires([version]))[0];
  }

  async wires(versions: readonly VersionRecord[]): Promise<VersionWire[]> {
    const [latest, previous, centers] = await Promise.all([
      this.decisions.latestOf(versions.map((version) => version.id)),
      this.versions.totalsOf(
        versions.flatMap((version) => (version.basedOnVersionId ? [version.basedOnVersionId] : [])),
      ),
      this.support.costCenters(versions.map((version) => version.costCenterId)),
    ]);
    const people = await this.support.people([
      ...versions.map((version) => version.createdByEmployeeId),
      ...[...latest.values()].map((decision) => decision.decidedByEmployeeId),
    ]);

    return Promise.all(
      versions.map(async (version) => {
        const money = await this.support.formatter(version.currency);
        const costCenter = centers.get(version.costCenterId);
        if (!costCenter) throw new BudgetCostCenterNotFoundError();
        const [q1, q2, q3, q4] = version.quarters ?? [];

        return {
          id: version.id,
          costCenter,
          year: version.year,
          number: version.number,
          kind: version.kind,
          state: version.state,
          proposalId: version.proposalId,
          basedOnVersionId: version.basedOnVersionId,
          rejectedPredecessorId: version.rejectedPredecessorId,
          base: money(version.baseMinor),
          reserve: money(version.reserveMinor),
          total: money(version.totalMinor),
          highValuePercent: version.highValuePercent,
          highValueAmount: version.highValueAmountMinor === null ? null : money(version.highValueAmountMinor),
          quarters:
            q1 === undefined || q2 === undefined || q3 === undefined || q4 === undefined
              ? null
              : { q1: money(q1), q2: money(q2), q3: money(q3), q4: money(q4) },
          reason: version.reason,
          previousTotal: version.basedOnVersionId ? money(previous.get(version.basedOnVersionId) ?? 0n) : null,
          decision: toDecisionWire(latest.get(version.id), people),
          createdBy: people.get(version.createdByEmployeeId) ?? null,
          createdAt: version.createdAt.toISOString(),
          sentAt: version.sentAt?.toISOString() ?? null,
          detachedAt: version.detachedAt?.toISOString() ?? null,
          neverCurrent: version.neverCurrent,
          expiredAt: version.expiredAt?.toISOString() ?? null,
        };
      }),
    );
  }
}

const toDecisionWire = (
  decision: DecisionRecord | undefined,
  people: ReadonlyMap<string, { employeeId: string; employeeCode: string; fullName: string }>,
): VersionWire['decision'] =>
  decision
    ? {
        decision: decision.decision,
        by: people.get(decision.decidedByEmployeeId) ?? null,
        reason: decision.reason,
        at: decision.decidedAt.toISOString(),
      }
    : null;

const summaryOf = (version: VersionWire): VersionSummaryWire => ({
  id: version.id,
  costCenter: version.costCenter,
  year: version.year,
  number: version.number,
  kind: version.kind,
  state: version.state,
  total: version.total,
  createdAt: version.createdAt,
  sentAt: version.sentAt,
});

const toChangeWire = (
  change: LineChangeRecord,
  by: { employeeId: string; employeeCode: string; fullName: string } | null,
): LineChangeWire => ({
  before: change.before,
  after: change.after,
  reason: change.reason,
  changedBy: by,
  changedAt: change.changedAt.toISOString(),
});
