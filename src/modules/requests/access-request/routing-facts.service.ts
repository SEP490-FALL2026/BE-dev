import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../core/business-date';
import { DbTx } from '../../../infrastructure/database/transaction-runner';
import { IdentityAccessApi } from '../../identity-access/public/identity-access.api';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import type { RoutingFacts } from './routing.policy';

/** What the routing table reads about the department and the approval roles on the day a request is sent. */
export interface GatheredRouting {
  facts: RoutingFacts;
  /** Who headed the department that day, whether or not they could still act: for the audit trail. */
  departmentHeadEmployeeId: string | null;
}

/**
 * Reads who heads the department and who holds the approval roles from the organization and identity-access facades,
 * and leaves out anyone who has left the company: a person who has left holds no step. Nobody is given a step by this
 * class; the routing table decides (`routing.policy.ts`).
 */
@Injectable()
export class RoutingFactsService {
  constructor(
    private readonly organizationReads: OrganizationReadApi,
    private readonly identity: IdentityAccessApi,
  ) {}

  async gather(
    tx: DbTx,
    input: { requesterEmployeeId: string; departmentId: string; today: BusinessDate; chainHasSpendStep: boolean },
  ): Promise<GatheredRouting> {
    const heads = await this.organizationReads.getDepartmentHeads([input.departmentId], input.today, tx);
    const head = heads.get(input.departmentId)?.employeeId ?? null;
    const roles = await this.identity.getApprovalRoleHolders(tx);
    const people = [head, roles.spendingApproverEmployeeId, roles.fallbackApproverEmployeeId].filter(
      (id): id is string => id !== null,
    );
    const working = new Set(
      (await this.organizationReads.getEmployees(people, tx)).filter((e) => e.status === 'ACTIVE').map((e) => e.id),
    );
    const whoCanAct = (id: string | null): string | null => (id !== null && working.has(id) ? id : null);

    return {
      departmentHeadEmployeeId: head,
      facts: {
        requesterEmployeeId: input.requesterEmployeeId,
        departmentHeadEmployeeId: whoCanAct(head),
        spendingApproverEmployeeId: whoCanAct(roles.spendingApproverEmployeeId),
        fallbackApproverEmployeeId: whoCanAct(roles.fallbackApproverEmployeeId),
        chainHasSpendStep: input.chainHasSpendStep,
      },
    };
  }
}
