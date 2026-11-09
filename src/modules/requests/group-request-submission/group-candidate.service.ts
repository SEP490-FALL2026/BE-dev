import { Injectable } from '@nestjs/common';
import { Page, pageOf } from '../../../core/application/pagination';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { RequestPartyEligibilityApi } from '../../identity-access/public/request-party-eligibility.api';
import { RequestPartyIneligibleError } from '../../identity-access/public/request-party.errors';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { AccessRequestNoDepartmentError } from '../access-request/access-request.errors';

export interface GroupCandidate {
  employeeId: string;
  fullName: string;
  workEmail: string;
}

/**
 * The people the caller may name in a request for a group (`US-05-17` AC-12): the people of their own department who still work
 * here and have a work email, by name. Only the name and the work email: not the job title, the tools they hold or anything else of
 * theirs. The spending approver is never listed; a person who cannot be named for another reason (they hold the plan, a request is open) is not hidden here: the check says why.
 */
@Injectable()
export class GroupCandidateService {
  constructor(
    private readonly organizationReads: OrganizationReadApi,
    private readonly requestParties: RequestPartyEligibilityApi,
  ) {}

  /** Throws RequestPartyIneligibleError (the caller cannot send a group, so has nobody to choose) and AccessRequestNoDepartmentError. */
  async page(
    actor: AuthenticatedPrincipal,
    query: { q?: string; page: number; pageSize: number },
  ): Promise<Page<GroupCandidate>> {
    const block = await this.requestParties.blockOf({
      requesterEmployeeId: actor.employeeId,
      beneficiaryEmployeeIds: [actor.employeeId],
    });
    if (block !== null) throw new RequestPartyIneligibleError(block);
    const today = await this.organizationReads.businessToday();
    const unit = (await this.organizationReads.getOwningUnits([actor.employeeId], today)).get(actor.employeeId);
    if (!unit) throw new AccessRequestNoDepartmentError();

    const ids = (await this.organizationReads.getDepartmentMemberIds(unit.departmentId, today)) ?? [];
    const head = (await this.organizationReads.getDepartmentHeads([unit.departmentId], today)).get(unit.departmentId)?.employeeId;
    const term = query.q?.trim().toLowerCase();
    // Whoever can never be named is left out before the page is cut, so the total is right (`D-S21`).
    const never = await this.requestParties.ineligibleAmong(ids);
    const named = (await this.organizationReads.getEmployees(ids))
      .filter((person) => !never.has(person.id) && person.id !== head)
      .flatMap((person) =>
        person.status === 'ACTIVE' && person.workEmail !== null && person.workEmail.trim() !== ''
          ? [{ employeeId: person.id, fullName: person.fullName, workEmail: person.workEmail }]
          : [],
      )
      .filter(
        (person) =>
          term === undefined ||
          person.fullName.toLowerCase().includes(term) ||
          person.workEmail.toLowerCase().includes(term),
      )
      .sort((a, b) => a.fullName.localeCompare(b.fullName) || a.employeeId.localeCompare(b.employeeId));
    const skip = (query.page - 1) * query.pageSize;

    return pageOf(named.slice(skip, skip + query.pageSize), named.length, query.page, query.pageSize);
  }
}
