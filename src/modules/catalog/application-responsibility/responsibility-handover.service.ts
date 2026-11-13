import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../audit/public/audit.api';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { catalogAuditEvent } from '../catalog-audit-event.mapper';
import { ApplicationRepo } from '../catalog-entry/application.repo';
import { PlanFactsService } from '../plan/plan-facts.service';
import { ResponsibilityHandoverRefusedError } from '../public/catalog-responsibility.errors';
import type { ResponsibilitiesTransferred, ResponsibilityCounts } from '../public/catalog-responsibility.types';
import { SubscriptionRepo } from '../subscription/subscription.repo';
import { handoverRefusal } from './responsibility-handover.policy';

/**
 * What an IT Admin answers for in the catalog, and handing all of it to another IT Admin at once (`QĐ-111g`, `R-8`, `R-26`): every
 * subscription and every application that names them responsible, in the transaction of the caller, with one audit event for each thing
 * that changed hands (the same action the transfer of one application writes). The caller judges who may hand over; this judges only that
 * the one who takes them is somebody else and an IT Admin who works now (an account that can act, whose departure has not blocked yet: the same
 * judgment as the admins of a plan at the vendor, `PlanFactsService.workingAdminsAmong`), on the account as it is in this transaction.
 */
@Injectable()
export class ResponsibilityHandoverService {
  constructor(
    private readonly applications: ApplicationRepo,
    private readonly subscriptions: SubscriptionRepo,
    private readonly planFacts: PlanFactsService,
    private readonly organizationReads: OrganizationReadApi,
    private readonly audit: AuditApi,
  ) {}

  /** How many subscriptions and applications each of these employees answers for, in two statements; an employee with none is counted zero. */
  async countOf(employeeIds: readonly string[], tx?: DbTx): Promise<Map<string, ResponsibilityCounts>> {
    const ids = [...new Set(employeeIds)];
    // One statement at a time: the caller's transaction runs a single query on its client.
    const subscriptions = await this.subscriptions.countResponsibleOf(ids, tx);
    const applications = await this.applications.countResponsibleOf(ids, tx);

    return new Map(
      ids.map((id) => [id, { subscriptions: subscriptions.get(id) ?? 0, applications: applications.get(id) ?? 0 }]),
    );
  }

  /** Throws ResponsibilityHandoverRefusedError (nothing was written). */
  async transfer(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    fromEmployeeId: string,
    toEmployeeId: string,
    source?: { kind: string; id: string },
  ): Promise<ResponsibilitiesTransferred> {
    const working = await this.planFacts.workingAdminsAmong([toEmployeeId], tx);
    const refusal = handoverRefusal({ fromEmployeeId, toEmployeeId, toIsUsableItAdmin: working.has(toEmployeeId) });
    if (refusal) throw new ResponsibilityHandoverRefusedError(refusal);
    const organization = await this.organizationReads.getOrganization(tx);
    if (!organization) throw new Error('The catalog was used before installation');

    const applicationIds = await this.applications.reassignResponsible(tx, fromEmployeeId, toEmployeeId);
    const subscriptionIds = await this.subscriptions.reassignResponsible(tx, fromEmployeeId, toEmployeeId);
    const before = { responsibleItAdminEmployeeId: fromEmployeeId };
    // The event that asked for it (a departure or a transfer) is part of what the Audit Trail says (`US-04-06` AC-3): who from, who to, why.
    const after = {
      responsibleItAdminEmployeeId: toEmployeeId,
      ...(source ? { sourceKind: source.kind, sourceId: source.id } : {}),
    };
    for (const id of applicationIds) {
      await this.audit.record(
        tx,
        catalogAuditEvent(
          actor,
          organization.id,
          'APPLICATION.RESPONSIBILITY_TRANSFERRED',
          'Application',
          id,
          before,
          after,
        ),
      );
    }
    for (const id of subscriptionIds) {
      await this.audit.record(
        tx,
        catalogAuditEvent(
          actor,
          organization.id,
          'SUBSCRIPTION.RESPONSIBILITY_TRANSFERRED',
          'Subscription',
          id,
          before,
          after,
        ),
      );
    }

    return { applicationIds, subscriptionIds };
  }
}
