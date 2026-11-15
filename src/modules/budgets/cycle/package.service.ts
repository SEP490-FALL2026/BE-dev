import { Injectable } from '@nestjs/common';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { BudgetCycleNotFoundError, type BaselineVersionRefusal } from '../budget/budget.errors';
import { BudgetFactsService } from '../budget/budget-facts.service';
import { ProposalRepo } from '../budget/proposal.repo';
import { VersionRepo } from '../budget/version.repo';
import { baselineVersionRefusal, inOrderOf, listedDepartments } from './baseline.policy';
import type { PackageWire } from './cycle.dto';
import type { ProposalRecord } from '../budget/proposal.repo';
import type { VersionRecord } from '../budget/version.repo';
import { CycleRepo, type CycleRecord } from './cycle.repo';

type Money = (minor: bigint) => { amount: string; currency: string };

/** What the package knows of one department before it is written out. */
interface DepartmentFacts {
  proposal: ProposalRecord | undefined;
  version: VersionRecord | undefined;
  head: { status: PackageWire['departments'][number]['headStatus']; refusal: BaselineVersionRefusal | null };
}

/** One department of the package: the open proposal, the version counted for it, and whether Finance may build it from the baseline. */
function departmentOf(
  brief: { id: string; code: string; name: string },
  facts: DepartmentFacts,
  format: Money,
): PackageWire['departments'][number] {
  const { proposal, version, head } = facts;

  return {
    departmentId: brief.id,
    departmentCode: brief.code,
    departmentName: brief.name,
    headStatus: head.status,
    baselineAllowed: head.refusal === null,
    baselineRefusal: head.refusal,
    proposal:
      proposal && (proposal.state === 'SUBMITTED' || proposal.state === 'REVIEWED')
        ? {
            id: proposal.id,
            total: format(proposal.totalMinor),
            state: proposal.state,
          }
        : null,
    version:
      version && (version.state === 'SENT' || version.state === 'CHANGES_REQUESTED' || version.state === 'APPROVED')
        ? {
            id: version.id,
            base: format(version.baseMinor),
            reserve: format(version.reserveMinor),
            total: format(version.baseMinor + version.reserveMinor),
            state: version.state,
            origin: version.origin,
          }
        : null,
  };
}

/**
 * The year against its annual ceiling (`AC-12`, `R-I06`): what the head of each department proposed, the version counted
 * for it, and the sums that say how far the proposals and the versions are from what is available (the annual ceiling less the
 * shared-pool reserve). Finance and the spending approver read it. Read-only; a fixed number of statements for any number of departments.
 */
@Injectable()
export class PackageService {
  constructor(
    private readonly facts: BudgetFactsService,
    private readonly cycles: CycleRepo,
    private readonly organizationReads: OrganizationReadApi,
    private readonly proposals: ProposalRepo,
    private readonly versions: VersionRepo,
  ) {}

  /** Throws BudgetNotAReaderError and BudgetCycleNotFoundError. */
  async read(actor: AuthenticatedPrincipal, year: number): Promise<PackageWire> {
    await this.facts.requireVersionReader(actor);
    const organizationId = await this.facts.organizationId();
    const cycle = await this.cycles.findByYear(organizationId, year);
    if (!cycle) throw new BudgetCycleNotFoundError();

    const departmentIds = await this.organizationReads.getActiveDepartmentIds(year);
    const listedIds = listedDepartments(departmentIds, undefined);
    const [briefs, costCenters, format] = await Promise.all([
      this.organizationReads.getDepartmentBriefs(listedIds),
      this.organizationReads.getUnitCostCenterIds(departmentIds),
      this.facts.formatter(cycle.currency),
    ]);
    const proposals = await this.proposals.openOfCostCenters([...costCenters.values()], year);
    const heads = await this.headFacts(cycle, listedIds, costCenters, proposals);
    const counted = new Map<string, VersionRecord>();
    let otherCurrency = 0;
    for (const version of await this.versions.countedInYear(organizationId, year)) {
      // A version in another currency cannot be added up (the annual check refuses to): it is left out and counted apart.
      if (version.currency !== cycle.currency) otherCurrency += 1;
      else if (!counted.has(version.costCenterId)) counted.set(version.costCenterId, version);
    }
    const available = cycle.annualCeilingMinor - (cycle.sharedPoolReserveMinor ?? 0n);

    // The same sum as the annual check makes at the sending of a version: every counted version of the year.
    const sum = (versions: Iterable<VersionRecord>) =>
      [...versions].reduce((total, version) => total + version.baseMinor + version.reserveMinor, 0n);
    const versionsTotal = sum(counted.values());
    // The departments listed are the first ones by id: a version of the Cost Center of one that was cut off is outside them.
    const listedCostCenters = new Set(listedIds.flatMap((id) => costCenters.get(id) ?? []));
    const outside = sum([...counted.values()].filter((version) => !listedCostCenters.has(version.costCenterId)));
    const proposalsTotal = [...proposals.values()].reduce((total, proposal) => total + proposal.totalMinor, 0n);
    const listed = inOrderOf(listedIds, briefs).map((brief) => {
      const costCenterId = costCenters.get(brief.id) ?? '';
      const proposal = proposals.get(costCenterId);

      return departmentOf(
        brief,
        {
          proposal,
          version: counted.get(costCenterId),
          head: heads.get(brief.id) ?? { status: 'NO_HEAD', refusal: 'CYCLE_NOT_OPEN' },
        },
        format,
      );
    });

    return {
      year,
      annualCeiling: format(cycle.annualCeilingMinor),
      sharedPoolReserve: cycle.sharedPoolReserveMinor === null ? null : format(cycle.sharedPoolReserveMinor),
      available: format(available),
      proposalsTotal: format(proposalsTotal),
      proposalsOverAvailable: proposalsTotal > available,
      versionsTotal: format(versionsTotal),
      versionsOutsideListed: format(outside),
      versionsInOtherCurrency: otherCurrency,
      overBy: format(versionsTotal > available ? versionsTotal - available : 0n),
      departmentsTotal: departmentIds.length,
      departments: listed,
    };
  }

  /**
   * Who heads each listed department and whether Finance may build its first version from the baseline now (`C4-13`, `QĐ-100h`): the same
   * `baselineVersionRefusal` the version of source `BASELINE` is judged by. Heads are read for all departments at once; only a department
   * nobody heads today asks whether somebody is named for later (at most those, in parallel).
   */
  private async headFacts(
    cycle: CycleRecord,
    departmentIds: readonly string[],
    costCenters: ReadonlyMap<string, string>,
    proposals: ReadonlyMap<string, ProposalRecord>,
  ): Promise<Map<string, DepartmentFacts['head']>> {
    const today = await this.facts.today(new Date());
    const heading = await this.organizationReads.getDepartmentHeads([...departmentIds], today);
    const entries = await Promise.all(
      departmentIds.map(async (departmentId) => {
        const headsToday = heading.has(departmentId);
        const headToCome = !headsToday && (await this.organizationReads.hasHeadStartingAfter(departmentId, today));
        const refusal = baselineVersionRefusal({
          cycleOpen: cycle.openedAt !== null,
          inCycle: true,
          today,
          submissionDeadline: cycle.submissionDeadline,
          openProposal: proposals.has(costCenters.get(departmentId) ?? ''),
        });
        const status = headsToday ? 'HAS_HEAD' : headToCome ? 'HEAD_TO_COME' : 'NO_HEAD';

        return [departmentId, { status, refusal }] as const;
      }),
    );

    return new Map(entries);
  }
}
