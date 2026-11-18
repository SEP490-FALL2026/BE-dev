import { Injectable } from '@nestjs/common';
import { pageOf, type Page } from '../../../core/application/pagination';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { UsageOverviewScopeService } from '../usage-overview/usage-overview-scope.service';
import { queueStatuses } from './identity.policy';
import { IdentityRepo } from './identity.repo';
import type { CandidateView, FindingRecord, MappingRecord, UnmatchedRecord, UnmatchedStatus } from './identity.types';
import { NoAssignmentFindingRepo } from './no-assignment-finding.repo';

export interface UnmatchedView extends UnmatchedRecord {
  /** The people it may be, by code and work email only: never a name (`US-08-04` AC-4). */
  candidates: CandidateView[];
}

export interface MappingView extends MappingRecord {
  employeeCode: string | null;
}

export interface FindingView extends FindingRecord {
  employeeCode: string | null;
}

/**
 * The reads of the queue, the mappings and the findings of the IT Admin. The queue is whole for every IT Admin (an identifier nobody was tied to
 * is the usage of nobody, `Q-5A-2`); a mapping and a finding belong to a person, so they are read only for the people of the departments the
 * IT Admin works (`QĐ-111ax`): a person outside that reach is an empty page, not an error (D8).
 */
@Injectable()
export class IdentityQueryService {
  constructor(
    private readonly repo: IdentityRepo,
    private readonly findings: NoAssignmentFindingRepo,
    private readonly organizationReads: OrganizationReadApi,
    private readonly scope: UsageOverviewScopeService,
  ) {}

  async queue(query: {
    applicationId?: string;
    importId?: string;
    status?: UnmatchedStatus;
    page: number;
    pageSize: number;
  }): Promise<Page<UnmatchedView>> {
    const { items, total } = await this.repo.pageUnmatched({
      ...(query.applicationId ? { applicationId: query.applicationId } : {}),
      ...(query.importId ? { importId: query.importId } : {}),
      statuses: queueStatuses(query.status),
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    });
    const people = await this.peopleOf(items.flatMap((item) => item.candidateEmployeeIds));

    return pageOf(
      items.map((item) => ({ ...item, candidates: this.candidatesOf(item, people) })),
      total,
      query.page,
      query.pageSize,
    );
  }

  /** The item as it is after a change, with its candidates. */
  async viewOf(item: UnmatchedRecord): Promise<UnmatchedView> {
    const people = await this.peopleOf(item.candidateEmployeeIds);

    return { ...item, candidates: this.candidatesOf(item, people) };
  }

  async mappings(
    actor: AuthenticatedPrincipal,
    query: {
      applicationId?: string;
      employeeId?: string;
      inForceOnly: boolean;
      page: number;
      pageSize: number;
    },
  ): Promise<Page<MappingView>> {
    const employeeIds = await this.readableEmployeeIds(actor, query.employeeId);
    if (employeeIds.length === 0) return pageOf([], 0, query.page, query.pageSize);
    const { items, total } = await this.repo.pageMappings({
      ...(query.applicationId ? { applicationId: query.applicationId } : {}),
      employeeIds,
      inForceOnly: query.inForceOnly,
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    });
    const people = await this.peopleOf(items.map((item) => item.employeeId));

    return pageOf(
      items.map((item) => ({ ...item, employeeCode: people.get(item.employeeId)?.employeeCode ?? null })),
      total,
      query.page,
      query.pageSize,
    );
  }

  async noAssignmentFindings(
    actor: AuthenticatedPrincipal,
    query: {
      applicationId?: string;
      status: 'OPEN' | 'CLOSED';
      page: number;
      pageSize: number;
    },
  ): Promise<Page<FindingView>> {
    const employeeIds = await this.readableEmployeeIds(actor, undefined);
    if (employeeIds.length === 0) return pageOf([], 0, query.page, query.pageSize);
    const { items, total } = await this.findings.page({
      ...(query.applicationId ? { applicationId: query.applicationId } : {}),
      employeeIds,
      status: query.status,
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    });
    const people = await this.peopleOf(items.map((item) => item.employeeId));

    return pageOf(
      items.map((item) => ({ ...item, employeeCode: people.get(item.employeeId)?.employeeCode ?? null })),
      total,
      query.page,
      query.pageSize,
    );
  }

  /**
   * The people whose mappings and findings the IT Admin reads: those placed today in the departments of their scope, or the one person asked
   * for when the last department they were placed in (they may have left) is in it, so a mapping of a person who has left can still be found and ended.
   */
  private async readableEmployeeIds(actor: AuthenticatedPrincipal, employeeId: string | undefined): Promise<string[]> {
    const people = await this.scope.peopleOf(
      actor,
      employeeId === undefined ? {} : { employeeId },
      await this.organizationReads.businessToday(),
    );

    return people.map((person) => person.employeeId);
  }

  private async peopleOf(
    ids: readonly string[],
  ): Promise<Map<string, { employeeCode: string; workEmail: string | null }>> {
    const unique = [...new Set(ids)];
    const records = unique.length === 0 ? [] : await this.organizationReads.getEmployees(unique);

    return new Map(
      records.map((record) => [record.id, { employeeCode: record.employeeCode, workEmail: record.workEmail }]),
    );
  }

  private candidatesOf(
    item: UnmatchedRecord,
    people: ReadonlyMap<string, { employeeCode: string; workEmail: string | null }>,
  ): CandidateView[] {
    return item.candidateEmployeeIds.flatMap((employeeId) => {
      const person = people.get(employeeId);

      return person ? [{ employeeId, employeeCode: person.employeeCode, workEmail: person.workEmail }] : [];
    });
  }
}
