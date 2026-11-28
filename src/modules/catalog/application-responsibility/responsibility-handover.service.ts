import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../audit/public/audit.api';
import type { AuditValue } from '../../audit/public/audit.types';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { catalogAuditEvent } from '../catalog-audit-event.mapper';
import { ApplicationRepo } from '../catalog-entry/application.repo';
import { PlanFactsService } from '../plan/plan-facts.service';
import { ResponsibilityHandoverRefusedError } from '../public/catalog-responsibility.errors';
import type { ResponsibilitiesTransferred, ResponsibilityCounts } from '../public/catalog-responsibility.types';
import { SubscriptionRepo } from '../subscription/subscription.repo';
import { LicenseLotRepo } from '../license-lot/license-lot.repo';
import { WorkspaceRepo } from '../workspace/workspace.repo';
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
    private readonly workspaces: WorkspaceRepo,
    private readonly lots: LicenseLotRepo,
  ) {}

  /** How many subscriptions, applications, workspaces, and license lots each of these employees answers for; an employee with none is counted zero. */
  async countOf(employeeIds: readonly string[], tx?: DbTx): Promise<Map<string, ResponsibilityCounts>> {
    const ids = [...new Set(employeeIds)];
    if (ids.length === 0) return new Map();
    // One statement at a time: the caller's transaction runs a single query on its client.
    const subscriptions = await this.subscriptions.countResponsibleOf(ids, tx);
    const applications = await this.applications.countResponsibleOf(ids, tx);
    const workspaces = await this.workspaces.countResponsibleOf(ids, tx);
    const licenseLots = await this.lots.countResponsibleOf(ids, tx);

    return new Map(
      ids.map((id) => [
        id,
        {
          subscriptions: subscriptions.get(id) ?? 0,
          applications: applications.get(id) ?? 0,
          workspaces: workspaces.get(id) ?? 0,
          licenseLots: licenseLots.get(id) ?? 0,
        },
      ]),
    );
  }

  /** Working IT Admins currently named responsible on active subscriptions of the plan. */
  async usableSubscriptionItAdminsOfPlan(planId: string, tx?: DbTx): Promise<string[]> {
    const ids = await this.subscriptions.findActiveResponsibleItAdminIdsOfPlan(planId, tx);
    if (ids.length === 0) return [];
    const usable = await this.planFacts.workingAdminsAmong(ids, tx);

    return ids.filter((id) => usable.has(id));
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
    // The workspaces come before the subscriptions (tier 5b before tier 6 of the lock order).
    const workspaceIds = await this.workspaces.reassignResponsible(tx, fromEmployeeId, toEmployeeId);
    const subscriptionIds = await this.subscriptions.reassignResponsible(tx, fromEmployeeId, toEmployeeId);
    // The lots come after the subscriptions they were born from (tier 6a after tier 6).
    const licenseLotIds = await this.lots.reassignResponsible(tx, fromEmployeeId, toEmployeeId);
    const before = { responsibleItAdminEmployeeId: fromEmployeeId };
    // The event that asked for it (a departure or a transfer) is part of what the Audit Trail says (`US-04-06` AC-3): who from, who to, why.
    const after = {
      responsibleItAdminEmployeeId: toEmployeeId,
      ...(source ? { sourceKind: source.kind, sourceId: source.id } : {}),
    };
    await this.auditAll(tx, actor, organization.id, before, after, [
      ['APPLICATION.RESPONSIBILITY_TRANSFERRED', 'Application', applicationIds],
      ['WORKSPACE.RESPONSIBLE_TRANSFERRED', 'Workspace', workspaceIds],
      ['SUBSCRIPTION.RESPONSIBILITY_TRANSFERRED', 'Subscription', subscriptionIds],
      ['LICENSE_LOT.RESPONSIBLE_TRANSFERRED', 'LicenseLot', licenseLotIds],
    ]);

    return { applicationIds, subscriptionIds, workspaceIds, licenseLotIds };
  }

  /** One audit event for each thing that changed hands, in the order the duties were handed over. */
  private async auditAll(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    organizationId: string,
    before: { [key: string]: AuditValue },
    after: { [key: string]: AuditValue },
    groups: readonly (readonly [action: string, resourceType: string, ids: readonly string[]])[],
  ): Promise<void> {
    for (const [action, resourceType, ids] of groups) {
      for (const id of ids) {
        await this.audit.record(tx, catalogAuditEvent(actor, organizationId, action, resourceType, id, before, after));
      }
    }
  }
}
