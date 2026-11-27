import { Injectable } from '@nestjs/common';
import { TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../audit/public/audit.api';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { catalogAuditEvent } from '../catalog-audit-event.mapper';
import { WorkspaceNotFoundError } from './workspace.errors';
import { judgeResponsibleChange } from './workspace.policy';
import { WorkspaceRepo } from './workspace.repo';
import { WorkspaceViewService } from './workspace-view.service';

/**
 * The Super Admin names the IT Admin who answers for a workspace (`QĐ-118f`, `QĐ-118l`): the only way it changes hands, apart from the hand-over of
 * an IT Admin who leaves (`SBF-16`). There is no stand-in for a workspace.
 *
 * Lock order: ONE lock, the workspace `FOR UPDATE` (tier 5b of `docs/rules/database-business.md`); the person named is judged on the account as it is
 * in this transaction. One audit event says who changed it, from whom to whom and why.
 */
@Injectable()
export class WorkspaceResponsibleService {
  constructor(
    private readonly repo: WorkspaceRepo,
    private readonly views: WorkspaceViewService,
    private readonly organizationReads: OrganizationReadApi,
    private readonly audit: AuditApi,
    private readonly runner: TransactionRunner,
  ) {}

  /** Throws WorkspaceNotFoundError and WorkspaceResponsibleNotItAdminError. */
  async change(actor: AuthenticatedPrincipal, id: string, input: { employeeId: string; reason: string }) {
    const organization = await this.organizationReads.getOrganization();
    if (!organization) throw new Error('The workspaces were used before installation');

    const changed = await this.runner.run(async (tx) => {
      const current = await this.repo.lock(tx, id);
      if (!current) throw new WorkspaceNotFoundError();
      const decision = judgeResponsibleChange({
        currentEmployeeId: current.responsibleItAdminEmployeeId,
        toEmployeeId: input.employeeId,
        toIsUsableItAdmin: await this.views.isUsableItAdmin(input.employeeId, tx),
      });
      if (decision === 'UNCHANGED') return false;

      await this.repo.setResponsible(tx, id, input.employeeId);
      await this.audit.record(
        tx,
        catalogAuditEvent(
          actor,
          organization.id,
          'WORKSPACE.RESPONSIBLE_CHANGED',
          'Workspace',
          id,
          { responsibleItAdminEmployeeId: current.responsibleItAdminEmployeeId },
          { responsibleItAdminEmployeeId: input.employeeId, reason: input.reason },
        ),
      );

      return true;
    });
    const after = await this.repo.find(id);
    if (!after) throw new WorkspaceNotFoundError();

    return { workspace: await this.views.detail(after), changed };
  }
}
