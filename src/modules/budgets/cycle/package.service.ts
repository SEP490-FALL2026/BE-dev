import { Injectable } from '@nestjs/common';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { BudgetCycleNotFoundError } from '../budget/budget.errors';
import { BudgetFactsService } from '../budget/budget-facts.service';
import { ProposalRepo } from '../budget/proposal.repo';
import { VersionRepo } from '../budget/version.repo';
import { DEPARTMENTS_LISTED_MAX } from './baseline.policy';
import type { PackageWire } from './cycle.dto';
import type { ProposalRecord } from '../budget/proposal.repo';
import type { VersionRecord } from '../budget/version.repo';
import { CycleRepo } from './cycle.repo';

/** One department of the package: its ceiling, the open proposal and the version counted for it. */
function departmentOf(
  brief: { id: string; code: string; name: string },
  facts: { ceiling: bigint | undefined; proposal: ProposalRecord | undefined; version: VersionRecord | undefined },
  format: (minor: bigint) => { amount: string; currency: string },
): PackageWire['departments'][number] {
  const { ceiling, proposal, version } = facts;

  return {
    departmentId: brief.id,
    departmentCode: brief.code,
    departmentName: brief.name,
    ceiling: ceiling === undefined ? null : format(ceiling),
    proposal:
      proposal && (proposal.state === 'SUBMITTED' || proposal.state === 'REVIEWED')
        ? { id: proposal.id, total: format(proposal.totalMinor), state: proposal.state }
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
 * The year against its annual ceiling (`AC-12`, `R-I06`): the ceiling of each department, what its head proposed, the version counted
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
    const [briefs, costCenters, format] = await Promise.all([
      this.organizationReads.getDepartmentBriefs(departmentIds),
      this.organizationReads.getUnitCostCenterIds(departmentIds),
      this.facts.formatter(cycle.currency),
    ]);
    const costCenterIds = [...costCenters.values()];
    const proposals = await this.proposals.openOfCostCenters(costCenterIds, year);
    const counted = new Map<string, VersionRecord>();
    let otherCurrency = 0;
    for (const version of await this.versions.countedInYear(organizationId, year)) {
      // A version in another currency cannot be added up (the annual check refuses to): it is left out and counted apart.
      if (version.currency !== cycle.currency) otherCurrency += 1;
      else if (!counted.has(version.costCenterId)) counted.set(version.costCenterId, version);
    }
    const ceilings = new Map(cycle.ceilings.map((ceiling) => [ceiling.departmentId, ceiling.totalMinor]));
    const available = cycle.annualCeilingMinor - (cycle.sharedPoolReserveMinor ?? 0n);

    // The same sum as the annual check makes at the sending of a version: every counted version of the year.
    const sum = (versions: Iterable<VersionRecord>) =>
      [...versions].reduce((total, version) => total + version.baseMinor + version.reserveMinor, 0n);
    const versionsTotal = sum(counted.values());
    const listedCostCenters = new Set(costCenterIds);
    const outside = sum([...counted.values()].filter((version) => !listedCostCenters.has(version.costCenterId)));
    const proposalsTotal = [...proposals.values()].reduce((total, proposal) => total + proposal.totalMinor, 0n);
    const listed = briefs.slice(0, DEPARTMENTS_LISTED_MAX).map((brief) => {
      const costCenterId = costCenters.get(brief.id) ?? '';

      return departmentOf(
        brief,
        { ceiling: ceilings.get(brief.id), proposal: proposals.get(costCenterId), version: counted.get(costCenterId) },
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
      departmentsTotal: briefs.length,
      departments: listed,
    };
  }
}
