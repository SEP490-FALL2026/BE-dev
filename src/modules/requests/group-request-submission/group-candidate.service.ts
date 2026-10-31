import { Injectable } from '@nestjs/common';
import { Page, pageOf } from '../../../core/application/pagination';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
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
 * theirs. A person who cannot be named for another reason (they hold the plan, a request is open) is not hidden here: the check says why.
 */
@Injectable()
export class GroupCandidateService {
  constructor(private readonly organizationReads: OrganizationReadApi) {}

  /** Throws AccessRequestNoDepartmentError. */
  async page(
    actor: AuthenticatedPrincipal,
    query: { q?: string; page: number; pageSize: number },
  ): Promise<Page<GroupCandidate>> {
    const today = await this.organizationReads.businessToday();
    const unit = (await this.organizationReads.getOwningUnits([actor.employeeId], today)).get(actor.employeeId);
    if (!unit) throw new AccessRequestNoDepartmentError();

    const ids = (await this.organizationReads.getDepartmentMemberIds(unit.departmentId, today)) ?? [];
    const term = query.q?.trim().toLowerCase();
    const named = (await this.organizationReads.getEmployees(ids))
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
