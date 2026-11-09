import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../core/business-date';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { DevicesApi } from '../../devices/public/devices.api';
import type {
  ApplicationUsageEvidence,
  EmployeeEvidence,
  EvidenceRequest,
  EvidenceSource,
} from '../public/usage-evidence.types';
import {
  ageDaysOf,
  canConcludeAbsence,
  detectableGroupsOf,
  distinctSorted,
  isStale,
  weakestMethod,
} from './usage-evidence.policy';
import { UsageEvidenceRepo, type CollectorDay, type VendorDay, type VendorSourceFacts } from './usage-evidence.repo';

const dayOf = (date: Date): BusinessDate => date.toISOString().slice(0, 10);

/**
 * One answer to "what does the usage of this application say of these people on this day" for the rules of wasted seats (`G3`, `G4`): the
 * vendors and the collector through one door, in a fixed number of statements. Days only, tied to people when read; never a volume.
 */
@Injectable()
export class UsageEvidenceService {
  constructor(
    private readonly repo: UsageEvidenceRepo,
    private readonly devices: DevicesApi,
  ) {}

  async evidenceFor(request: EvidenceRequest, tx?: DbTx): Promise<ApplicationUsageEvidence> {
    const { applicationId, asOf } = request;
    const employeeIds = [...new Set(request.employeeIds)];
    // One statement at a time: the client of a transaction runs one query at a time.
    const sources = await this.repo.vendorSources(applicationId, tx);
    const days = await this.repo.vendorDays(applicationId, employeeIds, asOf, tx);
    const changes = await this.repo.mappingChanges(applicationId, employeeIds, tx);
    const unmatched = await this.repo.unmatched(applicationId, tx);
    const evidence: EvidenceSource[] = sources.map((source) => this.vendor(source, days, employeeIds, changes, asOf));
    const collector = await this.collector(applicationId, employeeIds, asOf, tx);
    if (collector) evidence.push(collector);

    return {
      applicationId,
      asOf,
      sources: evidence,
      unmatchedIdentities: unmatched.map((item) => ({
        status: item.status,
        lastActivityDate: item.lastActivityDate,
        candidateEmployeeIds: item.candidateEmployeeIds,
      })),
    };
  }

  /** How many findings of activity with no seat are open: the figure of the IT Admin dashboard (Q-84). */
  openFindingCount(tx?: DbTx): Promise<number> {
    return this.repo.countOpenFindings(tx);
  }

  private vendor(
    source: VendorSourceFacts,
    days: readonly VendorDay[],
    employeeIds: readonly string[],
    changes: ReadonlyMap<string, BusinessDate>,
    asOf: BusinessDate,
  ): EvidenceSource {
    const ageDays = ageDaysOf(source.coverageTo, asOf);
    const mine = days.filter((day) => day.sourceId === source.id);

    return {
      kind: 'VENDOR',
      sourceId: source.id,
      name: source.name,
      coverage: { from: source.coverageFrom, to: source.coverageTo },
      windows: source.windows,
      ageDays,
      stale: isStale('VENDOR', ageDays),
      strictness: source.strictness,
      activityDefinition: source.activityDefinition,
      canConcludeAbsence: canConcludeAbsence('VENDOR', {
        direction: source.direction,
        capLastActivity: source.capLastActivity,
        capEventDetail: source.capEventDetail,
      }),
      detectableGroups: detectableGroupsOf(source),
      employees: employeeIds
        .map((employeeId) => this.employeeOfVendor(employeeId, mine, changes))
        .filter((employee) => employee.appeared || employee.mappingChangedOn !== null),
    };
  }

  private employeeOfVendor(
    employeeId: string,
    days: readonly VendorDay[],
    changes: ReadonlyMap<string, BusinessDate>,
  ): EmployeeEvidence {
    const own = days.filter((day) => day.employeeId === employeeId);
    const authOnly = own
      .filter((day) => day.eventClass === 'AUTH_ONLY')
      .map((day) => day.date)
      .sort();

    return {
      employeeId,
      activeDates: distinctSorted(own.filter((day) => day.eventClass !== 'AUTH_ONLY').map((day) => day.date)),
      appeared: own.length > 0,
      lastAuthOnlyDate: authOnly.length > 0 ? authOnly[authOnly.length - 1] : null,
      weakestMethod: weakestMethod(own.map((day) => day.method)),
      mappingChangedOn: changes.get(employeeId) ?? null,
    };
  }

  /** The collector as a source: the days a person held the machine a tool answered on, tied to them through the registration. */
  private async collector(
    applicationId: string,
    employeeIds: readonly string[],
    asOf: BusinessDate,
    tx?: DbTx,
  ): Promise<EvidenceSource | null> {
    const coverage = await this.repo.collectorCoverage(applicationId, asOf, tx);
    if (!coverage) return null;
    const registrations = await this.repo.collectorRegistrations(applicationId, tx);
    const holders = (await this.devices.registrationHolders(registrations, tx)).filter((holder) =>
      employeeIds.includes(holder.employeeId),
    );
    const days = await this.repo.collectorDays(
      applicationId,
      holders.map((holder) => holder.registrationId),
      asOf,
      tx,
    );
    const ageDays = ageDaysOf(coverage.to, asOf);

    return {
      kind: 'COLLECTOR',
      sourceId: null,
      name: 'collector',
      coverage,
      windows: [coverage],
      ageDays,
      stale: isStale('COLLECTOR', ageDays),
      strictness: null,
      activityDefinition: null,
      canConcludeAbsence: false,
      detectableGroups: ['G1', 'G2', 'G3', 'G4'],
      employees: employeeIds
        .map((employeeId) => this.employeeOfCollector(employeeId, holders, days))
        .filter((employee) => employee.appeared),
    };
  }

  private employeeOfCollector(
    employeeId: string,
    holders: ReadonlyArray<{ registrationId: string; employeeId: string; validFrom: Date; validUntil: Date | null }>,
    days: readonly CollectorDay[],
  ): EmployeeEvidence {
    const observed = days.filter((day) =>
      holders.some(
        (holder) =>
          holder.employeeId === employeeId &&
          holder.registrationId === day.registrationId &&
          day.date >= dayOf(holder.validFrom) &&
          (holder.validUntil === null || day.date <= dayOf(holder.validUntil)),
      ),
    );

    return {
      employeeId,
      activeDates: distinctSorted(observed.filter((day) => day.active).map((day) => day.date)),
      appeared: observed.length > 0,
      lastAuthOnlyDate: null,
      weakestMethod: null,
      mappingChangedOn: null,
    };
  }
}
