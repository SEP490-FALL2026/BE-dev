import { Injectable } from '@nestjs/common';
import { IdentityAccessApi } from '../../identity-access/public/identity-access.api';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { PolicyNotFoundError, PolicyNotPublishedError } from '../library/library.errors';
import { LibraryRepo } from '../library/library.repo';
import { acknowledgementStateOf } from './acknowledgement.policy';
import { AcknowledgementRepo } from './acknowledgement.repo';

export interface AcknowledgementReportRow {
  employeeId: string;
  employeeCode: string;
  fullName: string;
  state: 'DONE' | 'PENDING';
  versionNumber: number | null;
  acknowledgedAt: Date | null;
}

export interface AcknowledgementReport {
  policyCode: string;
  currentVersionNumber: number;
  rows: AcknowledgementReportRow[];
  total: number;
}

/**
 * Who has and who has not acknowledged the policy in force (`QĐ-111ar`): a page of the accounts of the roles it applies to, by employee
 * code, each with the latest version it acknowledged. One statement for the accounts and one for their acknowledgements.
 */
@Injectable()
export class AcknowledgementReportService {
  constructor(
    private readonly library: LibraryRepo,
    private readonly acknowledgements: AcknowledgementRepo,
    private readonly identity: IdentityAccessApi,
    private readonly organizationReads: OrganizationReadApi,
  ) {}

  /** Throws PolicyNotFoundError and PolicyNotPublishedError. */
  async report(code: string, page: number, pageSize: number): Promise<AcknowledgementReport> {
    const organization = await this.organizationReads.getOrganization();
    if (!organization) throw new Error('A report of policies was read before installation');
    const policy = await this.library.findPolicy(organization.id, code);
    if (!policy) throw new PolicyNotFoundError();
    const current = await this.library.current(policy.id);
    if (!current) throw new PolicyNotPublishedError();
    const [holders, facts] = await Promise.all([
      this.identity.pageUsableRoleHolders(current.applicableRoles, (page - 1) * pageSize, pageSize),
      this.library.versionFacts([policy.id]),
    ]);
    const given = await this.acknowledgements.ofPolicy(
      policy.id,
      holders.rows.map((row) => row.appUserId),
    );

    return {
      policyCode: code,
      currentVersionNumber: current.versionNumber,
      total: holders.total,
      rows: holders.rows.map((holder) => {
        const mine = given.filter((row) => row.appUserId === holder.appUserId);
        const latest = mine.reduce<(typeof mine)[number] | null>(
          (best, row) => (best === null || row.versionNumber > best.versionNumber ? row : best),
          null,
        );
        const state = acknowledgementStateOf({
          roles: current.applicableRoles,
          applicableRoles: current.applicableRoles,
          versions: facts,
          acknowledgedVersionNumbers: mine.map((row) => row.versionNumber),
        });

        return {
          employeeId: holder.employeeId,
          employeeCode: holder.employeeCode,
          fullName: holder.fullName,
          state: state === 'DONE' ? 'DONE' : 'PENDING',
          versionNumber: latest?.versionNumber ?? null,
          acknowledgedAt: latest?.acknowledgedAt ?? null,
        };
      }),
    };
  }
}
