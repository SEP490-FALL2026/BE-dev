import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { WorkspaceRepo } from '../workspace/workspace.repo';
import { WorkspaceViewService } from '../workspace/workspace-view.service';
import type { DefaultWorkspaceOfVendor, WorkspaceAdminView } from './workspace.types';

/**
 * What the rest of the application reads of the workspaces the company holds at its vendors: who administers one, how many of them work,
 * who answers for it, and which workspace a vendor offers when a subscription names none. It reads; every write has a route.
 */
@Injectable()
export class WorkspaceApi {
  constructor(
    private readonly repo: WorkspaceRepo,
    private readonly views: WorkspaceViewService,
  ) {}

  /** The administrators of each of these workspaces, in one read; a workspace that does not exist is absent. */
  async adminsOf(workspaceIds: readonly string[], tx?: DbTx): Promise<Map<string, WorkspaceAdminView[]>> {
    const records = await this.repo.findMany(workspaceIds, tx);

    return new Map(records.map((record) => [record.id, record.admins]));
  }

  /** How many administrators of the workspace work now as IT Admins; zero for a workspace that does not exist. */
  async workingAdminCount(workspaceId: string, tx?: DbTx): Promise<number> {
    const record = await this.repo.find(workspaceId, tx);

    return record ? this.views.workingAdminCount(record, tx) : 0;
  }

  /** The employee who answers for the workspace; null when nobody does or the workspace does not exist. */
  async responsibleOf(workspaceId: string, tx?: DbTx): Promise<string | null> {
    return (await this.repo.find(workspaceId, tx))?.responsibleItAdminEmployeeId ?? null;
  }

  /** The workspace a subscription of a plan of this vendor takes when it names none: the vendor's only one; none; or several to choose from. */
  async defaultWorkspaceOfVendor(vendorId: string, tx?: DbTx): Promise<DefaultWorkspaceOfVendor> {
    const workspaces = await this.repo.findOfVendor(vendorId, tx);
    if (workspaces.length === 0) return { kind: 'NONE' };
    if (workspaces.length === 1) return { kind: 'ONE', workspaceId: workspaces[0].id };

    return { kind: 'MANY', workspaceIds: workspaces.map((workspace) => workspace.id) };
  }
}
