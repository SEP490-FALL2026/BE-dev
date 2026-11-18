import { Injectable } from '@nestjs/common';
import { Page, pageOf } from '../../../core/application/pagination';

import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { BudgetCostCenterNotFoundError, BudgetVersionNotFoundError } from './budget.errors';
import {
  belowCarriedOver,
  carriedOverShortfall,
  defaultReserveOf,
  versionWaitingReason,
  type VersionStateName,
} from './budget.policy';
import { BudgetFactsService } from './budget-facts.service';
import { DecisionRepo, type DecisionRecord } from './decision.repo';
import { CarriedOverContributions } from '../public/budgets.extension-points';
import { VersionRepo, type VersionRecord, type VersionState } from './version.repo';
import type { VersionSummaryWire, VersionWire } from './budget.dto';

/** A version and its lines as a reader sees them: amounts in the currency of the version, people and Cost Centers by name. */
@Injectable()
export class VersionViewService {
  constructor(
    private readonly versions: VersionRepo,
    private readonly decisions: DecisionRepo,
    private readonly facts: BudgetFactsService,
    private readonly carried: CarriedOverContributions,
  ) {}

  async require(id: string): Promise<VersionRecord> {
    const version = await this.versions.findById(id);
    if (!version) throw new BudgetVersionNotFoundError();

    return version;
  }

  async get(actor: AuthenticatedPrincipal, id: string): Promise<VersionWire> {
    await this.facts.requireVersionReader(actor);

    return this.wire(await this.require(id));
  }

  async list(
    actor: AuthenticatedPrincipal,
    query: { state?: VersionState; year?: number; page: number; pageSize: number },
  ): Promise<Page<VersionSummaryWire>> {
    await this.facts.requireVersionReader(actor);
    const { items, total } = await this.versions.page({
      ...(query.state ? { state: query.state } : {}),
      ...(query.year ? { year: query.year } : {}),
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    });

    return pageOf((await this.wires(items)).map(summaryOf), total, query.page, query.pageSize);
  }

  async wire(version: VersionRecord): Promise<VersionWire> {
    return (await this.wires([version]))[0];
  }

  async wires(versions: readonly VersionRecord[]): Promise<VersionWire[]> {
    const [latest, centers] = await Promise.all([
      this.decisions.latestOf(versions.map((version) => version.id)),
      this.facts.costCenters(versions.map((version) => version.costCenterId)),
    ]);
    // Read once for the page, and only when some version waits for a decision.
    const approver = versions.some((version) => version.state === 'SENT')
      ? await this.facts.usableSpendingApproverEmployeeId()
      : null;
    const people = await this.facts.people([
      ...versions.map((version) => version.createdByEmployeeId),
      ...[...latest.values()].map((decision) => decision.decidedByEmployeeId),
    ]);
    const carriedOver = await this.carriedOverOf(versions);
    // The reserve the default share of the organization gives, which a reserve that differs from asks its reason when sent.
    const defaultPercent = await this.facts.reserveDefaultPercent();

    return Promise.all(
      versions.map(async (version) => {
        const money = await this.facts.formatter(version.currency);
        const costCenter = centers.get(version.costCenterId);
        if (!costCenter) throw new BudgetCostCenterNotFoundError();

        return {
          id: version.id,
          costCenter,
          year: version.year,
          number: version.number,
          state: wireStateOf(version.state),
          proposalId: version.proposalId,
          rejectedPredecessorId: version.rejectedPredecessorId,
          base: money(version.baseMinor),
          reserve: money(version.reserveMinor),
          reservePercent: version.reservePercent,
          defaultReserve:
            version.reservePercent === null ? null : money(defaultReserveOf(version.baseMinor, defaultPercent)),
          carriedOverNextYear: money(carriedOver(version)),
          belowCarriedOver: belowCarriedOver(version, carriedOver(version)),
          carriedOverShortfall: money(carriedOverShortfall(version, carriedOver(version))),
          // The version Finance built from the baseline: the department had no proposal, or no head to send one (the older kind, `QĐ-104f`).
          noProposalSubmitted: version.origin === 'BASELINE_NO_PROPOSAL' || version.origin === 'BASELINE_NO_HEAD',
          reserveReason: version.reserveReason,
          baseReason: version.baseReason,
          origin: version.origin,
          total: money(version.totalMinor),
          reason: version.reason,
          waitingReason: versionWaitingReason(version.state, approver),
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

  /** What each Cost Center carries into the year of each version (`QĐ-111ac`): one ask of the contexts for each year on the page. */
  private async carriedOverOf(versions: readonly VersionRecord[]): Promise<(version: VersionRecord) => bigint> {
    const byYear = new Map<number, Map<string, bigint>>();
    for (const year of new Set(versions.map((version) => version.year))) {
      const ids = [...new Set(versions.filter((version) => version.year === year).map((one) => one.costCenterId))];
      byYear.set(year, await this.carried.totals(ids, year));
    }

    return (version) => byYear.get(version.year)?.get(version.costCenterId) ?? 0n;
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
  state: version.state,
  total: version.total,
  createdAt: version.createdAt,
  sentAt: version.sentAt,
});

/** The database refuses `SUPERSEDED` (`budget_versions_no_superseded`), so a version read from it never stands there. */
const wireStateOf = (state: VersionStateName): Exclude<VersionStateName, 'SUPERSEDED'> =>
  state as Exclude<VersionStateName, 'SUPERSEDED'>;
