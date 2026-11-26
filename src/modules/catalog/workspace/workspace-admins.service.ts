import { Injectable } from '@nestjs/common';
import { TransactionRunner, type DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../audit/public/audit.api';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { catalogAuditEvent } from '../catalog-audit-event.mapper';
import { WorkspaceNotFoundError, WorkspaceStaleError } from './workspace.errors';
import { assertAdminsShape, assertResponsible } from './workspace.policy';
import { WorkspaceRepo } from './workspace.repo';
import { WorkspaceViewService } from './workspace-view.service';
import type { WorkspaceAdminRecord, WorkspaceRecord } from './workspace.types';

const snapshot = (admins: readonly WorkspaceAdminRecord[], primaryOwnerEmployeeId: string | null) => ({
  admins: admins.map((admin) => `${admin.employeeId}:${admin.role}`).sort(),
  primaryOwnerEmployeeId,
});

/**
 * Who administers a workspace at the vendor (`QĐ-110k`): recorded as a whole and replaced as a whole, by the IT Admin who answers for the
 * workspace alone (`QĐ-118f`). At least two different people, the primary owner among them as an owner, every one an IT Admin with an account that
 * can sign in; whether they still work is not judged here: a reader sees it in the flags (`QĐ-117e`).
 *
 * Lock order: tier 1 `employees` `FOR SHARE` (and account second) in ascending `employeeId` order via `requireItAdmin`, BEFORE tier 5b `workspaces`
 * `FOR UPDATE` (`docs/rules/database-business.md`).
 */
@Injectable()
export class WorkspaceAdminsService {
  constructor(
    private readonly repo: WorkspaceRepo,
    private readonly views: WorkspaceViewService,
    private readonly organizationReads: OrganizationReadApi,
    private readonly audit: AuditApi,
    private readonly runner: TransactionRunner,
  ) {}

  /**
   * Replaces the administrators on the version the caller read. Throws WorkspaceNotFoundError, WorkspaceNotResponsibleError, WorkspaceStaleError,
   * WorkspaceAdminsTooFewError, WorkspacePrimaryOwnerNotAdminError, WorkspaceLimitExceededError and WorkspaceAdminNotItAdminError.
   */
  async set(
    actor: AuthenticatedPrincipal,
    id: string,
    input: { admins: WorkspaceAdminRecord[]; primaryOwnerEmployeeId: string; expectedUpdatedAt: Date },
  ) {
    const organization = await this.organizationReads.getOrganization();
    if (!organization) throw new Error('The workspaces were used before installation');

    await this.runner.run((tx) => this.setInTx(tx, actor, organization.id, id, input));
    const after = await this.repo.find(id);
    if (!after) throw new WorkspaceNotFoundError();

    return this.views.detail(after);
  }

  /**
   * Replaces the administrators inside a caller-managed transaction. When `options.employeesChecked` is true, the caller has already locked
   * every employee `FOR SHARE` in ascending `id` order before locking the workspace (`T-1`). When `options.limits` is provided, checks against
   * those new limits instead of the stored ones (`W-6`).
   */
  async setInTx(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    organizationId: string,
    id: string,
    input: { admins: WorkspaceAdminRecord[]; primaryOwnerEmployeeId: string; expectedUpdatedAt: Date },
    options: {
      current?: WorkspaceRecord;
      limits?: { ownerLimit: number | null; adminLimit: number | null };
      employeesChecked?: boolean;
    } = {},
  ): Promise<WorkspaceRecord> {
    if (!options.employeesChecked) {
      for (const employeeId of [...new Set(input.admins.map((admin) => admin.employeeId))].sort()) {
        await this.views.requireItAdmin(tx, employeeId);
      }
    }
    const current = options.current ?? (await this.repo.lock(tx, id));
    if (!current) throw new WorkspaceNotFoundError();
    assertResponsible(actor.employeeId, current.responsibleItAdminEmployeeId);
    if (current.updatedAt.getTime() !== input.expectedUpdatedAt.getTime())
      throw new WorkspaceStaleError(current.updatedAt);
    assertAdminsShape({
      admins: input.admins,
      primaryOwnerEmployeeId: input.primaryOwnerEmployeeId,
      ownerLimit: options.limits ? options.limits.ownerLimit : current.ownerLimit,
      adminLimit: options.limits ? options.limits.adminLimit : current.adminLimit,
    });

    await this.repo.replaceAdmins(tx, id, input.admins, input.primaryOwnerEmployeeId);
    await this.audit.record(
      tx,
      catalogAuditEvent(
        actor,
        organizationId,
        'WORKSPACE.ADMINS_SET',
        'Workspace',
        id,
        snapshot(current.admins, current.primaryOwnerEmployeeId),
        snapshot(input.admins, input.primaryOwnerEmployeeId),
      ),
    );
    const after = await this.repo.find(id, tx);
    if (!after) throw new WorkspaceNotFoundError();

    return after;
  }
}
