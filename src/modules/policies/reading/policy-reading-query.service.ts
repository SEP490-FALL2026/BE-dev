import { Injectable } from '@nestjs/common';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { AcknowledgementFactsService } from '../acknowledgement/acknowledgement-facts.service';
import { policyRolesOf } from '../acknowledgement/acknowledgement.policy';
import {
  PolicyNotFoundError,
  PolicyNotPublishedError,
  PolicyStepNotFoundError,
  PolicyVersionNotFoundError,
} from '../library/library.errors';
import { LibraryRepo } from '../library/library.repo';
import type { PolicyRecord, PublishedVersionRecord } from '../library/library.types';
import { toPolicyDetail, toPolicyStep, toPolicySummary, toVersionSummary } from './policy-reading.mapper';

const isSuperAdmin = (caller: AuthenticatedPrincipal) => caller.roles.includes('SUPER_ADMIN');

/** What every signed-in account reads of the library: the list, one version with its text, the history and the checklist of one step. */
@Injectable()
export class PolicyReadingQueryService {
  constructor(
    private readonly library: LibraryRepo,
    private readonly facts: AcknowledgementFactsService,
    private readonly organizationReads: OrganizationReadApi,
  ) {}

  /** A page of the policies that have a version in force, by code, each with what the caller owes of it. */
  async list(caller: AuthenticatedPrincipal, page: number, pageSize: number) {
    const organization = await this.requireOrganization();
    const { rows, total } = await this.library.policyPage(organization.id, (page - 1) * pageSize, pageSize);
    const states = await this.facts.statesOf(this.reader(caller), rows);
    const items = rows.flatMap((policy) => {
      const state = states.get(policy.id);

      return policy.current && state ? [toPolicySummary(policy, policy.current, state, isSuperAdmin(caller))] : [];
    });

    return { items, pagination: { page, pageSize, totalItems: total, totalPages: Math.ceil(total / pageSize) } };
  }

  /** Throws PolicyNotFoundError, PolicyNotPublishedError and PolicyVersionNotFoundError. */
  async detail(caller: AuthenticatedPrincipal, code: string, versionNumber?: number) {
    const organization = await this.requireOrganization();
    const policy = await this.requirePolicy(organization.id, code);
    const current = await this.library.current(policy.id);
    if (!current) throw new PolicyNotPublishedError();
    const shown = versionNumber === undefined ? current : await this.library.byNumber(policy.id, versionNumber);
    if (!shown) throw new PolicyVersionNotFoundError();
    const isCurrent = shown.id === current.id;
    const state = isCurrent ? await this.stateOf(caller, policy.id, code, current) : null;

    return toPolicyDetail(shown, isCurrent, state);
  }

  /** Throws PolicyNotFoundError. A page of the published versions, the newest first. */
  async versions(code: string, page: number, pageSize: number) {
    const organization = await this.requireOrganization();
    const policy = await this.requirePolicy(organization.id, code);
    const { rows, total } = await this.library.versionPage(policy.id, (page - 1) * pageSize, pageSize);

    return {
      items: rows.map(toVersionSummary),
      pagination: { page, pageSize, totalItems: total, totalPages: Math.ceil(total / pageSize) },
    };
  }

  /** Throws PolicyNotFoundError, PolicyNotPublishedError and PolicyStepNotFoundError. The checklist of one step of the version in force. */
  async step(code: string, stepCode: string) {
    const organization = await this.requireOrganization();
    const policy = await this.requirePolicy(organization.id, code);
    const current = await this.library.current(policy.id);
    if (!current) throw new PolicyNotPublishedError();
    const step = current.content.steps.find((candidate) => candidate.code === stepCode);
    if (!step) throw new PolicyStepNotFoundError();

    return toPolicyStep(current, step);
  }

  private async stateOf(
    caller: AuthenticatedPrincipal,
    policyId: string,
    code: string,
    current: PublishedVersionRecord,
  ) {
    const record: PolicyRecord = { id: policyId, code, current, hasDraft: false };
    const states = await this.facts.statesOf(this.reader(caller), [record]);

    return states.get(policyId) ?? 'NOT_REQUIRED';
  }

  private reader(caller: AuthenticatedPrincipal) {
    return { appUserId: caller.appUserId, roles: policyRolesOf(caller.directRoles) };
  }

  private async requirePolicy(organizationId: string, code: string) {
    const policy = await this.library.findPolicy(organizationId, code);
    if (!policy) throw new PolicyNotFoundError();

    return policy;
  }

  private async requireOrganization() {
    const organization = await this.organizationReads.getOrganization();
    if (!organization) throw new Error('The policy library was read before installation');

    return organization;
  }
}
