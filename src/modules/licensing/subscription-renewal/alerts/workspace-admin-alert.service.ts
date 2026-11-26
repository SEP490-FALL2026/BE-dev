import { Injectable } from '@nestjs/common';
import { TransactionRunner } from '../../../../infrastructure/database/transaction-runner';
import { CatalogResponsibilityApi } from '../../../catalog/public/catalog-responsibility.api';
import { IdentityAccessApi } from '../../../identity-access/public/identity-access.api';
import { RenewalNotifier } from '../subscription-renewal-notifier.service';

/**
 * Emits `WORKSPACE_ADMIN_NOT_WORKING` once per `(workspace, admin)` during the hourly renewal sweep when a workspace administrator
 * no longer works as an IT Admin (role change off `IT_ADMIN`, locked account, or departure). Recipient follows rule R1:
 * the usable IT Admin responsible for the workspace (when different from the affected admin), else the usable Super Admin.
 */
@Injectable()
export class WorkspaceAdminAlertService {
  constructor(
    private readonly catalog: CatalogResponsibilityApi,
    private readonly identity: IdentityAccessApi,
    private readonly notifier: RenewalNotifier,
    private readonly runner: TransactionRunner,
  ) {}

  async sweep(organizationId: string): Promise<number> {
    const affected = (await this.catalog.workspacesWithNotWorkingAdmins()).filter(
      (workspace) => workspace.organizationId === organizationId,
    );
    if (affected.length === 0) return 0;

    return this.runner.run(async (tx) => {
      const responsibleIds = [
        ...new Set(
          affected.map((workspace) => workspace.responsibleItAdminEmployeeId).filter((id): id is string => id !== null),
        ),
      ];
      const usableItAdmins =
        responsibleIds.length > 0
          ? await this.identity.findUsableItAdminEmployeeIds(responsibleIds, tx)
          : new Set<string>();
      const superAdmin = await this.identity.findUsableSuperAdminEmployeeId(tx);

      let told = 0;
      for (const workspace of affected) {
        const responsible = workspace.responsibleItAdminEmployeeId;
        for (const employeeId of workspace.notWorkingAdminEmployeeIds) {
          const recipient =
            responsible !== null && responsible !== employeeId && usableItAdmins.has(responsible)
              ? responsible
              : superAdmin !== null && superAdmin !== employeeId
                ? superAdmin
                : null;
          if (recipient === null) continue;
          const sent = await this.notifier.tell(tx, {
            organizationId,
            recipients: [recipient],
            code: 'WORKSPACE_ADMIN_NOT_WORKING',
            subject: { type: 'WORKSPACE', id: workspace.workspaceId },
            params: {
              workspaceId: workspace.workspaceId,
              employeeId,
              workingAdminCount: workspace.workingAdminCount,
            },
            eventKey: `WORKSPACE_ADMIN_NOT_WORKING:${workspace.workspaceId}:${employeeId}`,
          });
          told += sent.length;
        }
      }

      return told;
    });
  }
}
