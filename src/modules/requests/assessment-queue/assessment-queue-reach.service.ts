import { Injectable } from '@nestjs/common';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { IdentityAccessApi } from '../../identity-access/public/identity-access.api';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';

/**
 * The departments an IT Admin reads proposals of (`US-01-11`, R-20): the ones that name them in charge and, while nobody who works is named for a
 * department, that one too. A department the caller asks for that is not among them is not an error: the answer is empty, as it is for any filter
 * outside the scope (D8). The caller's departments are never taken from the request.
 */
@Injectable()
export class AssessmentQueueReachService {
  constructor(
    private readonly organizationReads: OrganizationReadApi,
    private readonly identity: IdentityAccessApi,
  ) {}

  /** The departments in scope; narrowed to the one asked for when there is one, empty when that one is out of scope. */
  async departmentsOf(actor: AuthenticatedPrincipal, asked?: string): Promise<string[]> {
    const scope = await this.organizationReads.getItAdminScope(actor.employeeId, (ids) =>
      this.identity.findUsableItAdminEmployeeIds(ids),
    );

    return asked === undefined ? scope : scope.filter((departmentId) => departmentId === asked);
  }
}
