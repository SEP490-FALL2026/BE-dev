import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../audit/public/audit.api';
import { searchKey } from '../vendor-dictionary/vendor-matcher.policy';
import { catalogAuditEvent } from '../catalog-audit-event.mapper';
import { WorkspaceNotFoundError, WorkspaceRequiredError, WorkspaceVendorMismatchError } from './workspace.errors';
import { WorkspaceRepo } from './workspace.repo';
import type { WorkspaceRecord } from './workspace.types';
import { WorkspaceViewService } from './workspace-view.service';

/** What a write of a subscription knows of its plan when it asks which workspace the subscription is held in. */
export interface WorkspaceTarget {
  /** The vendor of the application of the plan; null for an internal application. */
  vendorId: string | null;
  /** The plan is one the company administers at the vendor (a K2 plan, or a K4 plan with an admin console): it must be held in a workspace. */
  needsWorkspace: boolean;
}

/**
 * Which workspace a subscription is held in (W3-11) and the lock on it (W3-14). A workspace named must be held at the vendor of the plan; none named,
 * a plan the company administers at the vendor takes the only workspace of the vendor, a workspace named after the vendor is made when it has none
 * (the person who writes answers for it, `QĐ-118d`), and several is for the caller to choose. Any other plan is held in none unless one is named.
 *
 * Lock order: the workspace `FOR UPDATE` (tier 5b of `docs/rules/database-business.md`), taken before the period and the plan, and in id order when
 * two are taken (`lockBoth`).
 */
@Injectable()
export class WorkspaceForSubscriptionService {
  constructor(
    private readonly repo: WorkspaceRepo,
    private readonly audit: AuditApi,
    private readonly views: WorkspaceViewService,
  ) {}

  /** How many administrators of this workspace work now as IT Admins (reused by subscription & lot gates, W3-12 / W3-24). */
  async workingAdminCount(tx: DbTx, workspaceId: string): Promise<number> {
    const workspace = await this.repo.find(workspaceId, tx);

    return workspace ? this.views.workingAdminCount(workspace, tx) : 0;
  }

  /** Reads these workspaces (with their administrators) in one query by id order. */
  findMany(ids: readonly string[], tx?: DbTx): Promise<WorkspaceRecord[]> {
    return this.repo.findMany(ids, tx);
  }

  /** Which of these employee ids work now as IT Admins (`QĐ-110k`). */
  workingAdminsAmong(employeeIds: readonly string[], tx?: DbTx): Promise<Set<string>> {
    return this.views.workingAdminsAmong(employeeIds, tx);
  }

  /**
   * The workspace the subscription is held in, locked until the transaction ends; null for a plan that needs none and names none. Throws
   * WorkspaceNotFoundError, WorkspaceVendorMismatchError and WorkspaceRequiredError.
   */
  async resolveAndLock(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    organizationId: string,
    target: WorkspaceTarget,
    named: string | null | undefined,
  ): Promise<string | null> {
    const id = named ?? (await this.defaultOf(tx, actor, organizationId, target));
    if (id === null) return null;
    const workspace = await this.repo.lock(tx, id);
    if (!workspace) throw new WorkspaceNotFoundError();
    if (target.vendorId === null || workspace.vendorId !== target.vendorId) throw new WorkspaceVendorMismatchError();

    return id;
  }

  /** Locks the workspaces of a move in one statement in id order, and answers whether they are all held at this vendor. Throws WorkspaceNotFoundError. */
  async lockBoth(tx: DbTx, ids: readonly (string | null)[], vendorId: string | null): Promise<void> {
    const ordered = [...new Set(ids.filter((id): id is string => id !== null))].sort();
    for (const id of ordered) {
      const workspace = await this.repo.lock(tx, id);
      if (!workspace) throw new WorkspaceNotFoundError();
      if (vendorId === null || workspace.vendorId !== vendorId) throw new WorkspaceVendorMismatchError();
    }
  }

  private async defaultOf(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    organizationId: string,
    target: WorkspaceTarget,
  ): Promise<string | null> {
    if (!target.needsWorkspace || target.vendorId === null) return null;
    const existing = await this.repo.findOfVendor(target.vendorId, tx);
    if (existing.length === 1) return existing[0].id;
    if (existing.length > 1) throw new WorkspaceRequiredError(existing.map((workspace) => workspace.id));

    return this.makeNamedAfterVendor(tx, actor, organizationId, target.vendorId);
  }

  /** A workspace named after the vendor, made by the person who writes; two writes at once make one (the second finds the first). */
  private async makeNamedAfterVendor(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    organizationId: string,
    vendorId: string,
  ): Promise<string> {
    const name = await this.repo.findVendorName(tx, vendorId);
    if (name === null) throw new WorkspaceVendorMismatchError();
    const made = await this.repo.insertIfAbsent(tx, {
      organizationId,
      vendorId,
      name,
      normalizedName: searchKey(name),
      responsibleItAdminEmployeeId: actor.employeeId,
    });
    if (made === null) {
      const [first] = await this.repo.findOfVendor(vendorId, tx);

      return first.id;
    }
    await this.audit.record(
      tx,
      catalogAuditEvent(actor, organizationId, 'WORKSPACE.CREATED', 'Workspace', made, null, {
        vendorId,
        name,
        responsibleItAdminEmployeeId: actor.employeeId,
      }),
    );

    return made;
  }
}
