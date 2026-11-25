import { workspaceFlags } from './workspace.policy';
import type { WorkspaceRecord } from './workspace.types';

/** What the answers need to know beside the workspace itself: the names of the people and which administrators work now. */
export interface WorkspaceContext {
  names: ReadonlyMap<string, string>;
  working: ReadonlySet<string>;
  subscriptionCount: number;
}

const nameOf = (context: WorkspaceContext, employeeId: string): string => {
  const name = context.names.get(employeeId);
  if (name === undefined) throw new Error('A person of a workspace is not an employee');

  return name;
};

const person = (context: WorkspaceContext, employeeId: string) => ({ employeeId, name: nameOf(context, employeeId) });

/** A row of the list of workspaces: the vendor, how many administrators and how many of them work, and what the reader is warned of. */
export function toWorkspaceSummaryWire(workspace: WorkspaceRecord, context: WorkspaceContext) {
  const workingAdminCount = workspace.admins.filter((admin) => context.working.has(admin.employeeId)).length;

  return {
    id: workspace.id,
    vendor: { id: workspace.vendorId, name: workspace.vendorName },
    name: workspace.name,
    adminCount: workspace.admins.length,
    workingAdminCount,
    flags: workspaceFlags({
      workingAdminCount,
      ownerAccountEmail: workspace.ownerAccountEmail,
      responsibleItAdminEmployeeId: workspace.responsibleItAdminEmployeeId,
    }),
    responsibleItAdmin: workspace.responsibleItAdminEmployeeId
      ? person(context, workspace.responsibleItAdminEmployeeId)
      : null,
    subscriptionCount: context.subscriptionCount,
  };
}

/** The workspace as a detail: the row of the list, its administrators (each marked when they no longer work as IT Admin) and its profile. */
export function toWorkspaceDetailWire(workspace: WorkspaceRecord, context: WorkspaceContext) {
  return {
    ...toWorkspaceSummaryWire(workspace, context),
    admins: workspace.admins.map((admin) => ({
      ...person(context, admin.employeeId),
      role: admin.role,
      flags: context.working.has(admin.employeeId) ? [] : ['ADMIN_NOT_WORKING' as const],
    })),
    primaryOwner: workspace.primaryOwnerEmployeeId ? person(context, workspace.primaryOwnerEmployeeId) : null,
    ownerAccountEmail: workspace.ownerAccountEmail,
    ownerLimit: workspace.ownerLimit,
    adminLimit: workspace.adminLimit,
    ownerTransferProcedure: workspace.ownerTransferProcedure,
    emergencyAccount: workspace.emergencyAccount
      ? {
          identity: workspace.emergencyAccount.identity,
          occupiesSeat: workspace.emergencyAccount.occupiesSeat,
          holder: person(context, workspace.emergencyAccount.holderEmployeeId),
          lastReviewedOn: workspace.emergencyAccount.lastReviewedOn,
        }
      : null,
    adminNote: workspace.adminNote,
    updatedAt: workspace.updatedAt.toISOString(),
  };
}

/** The ids of every person a workspace names, to read their names in one go. */
export function peopleOf(workspace: WorkspaceRecord): string[] {
  return [
    ...workspace.admins.map((admin) => admin.employeeId),
    ...(workspace.primaryOwnerEmployeeId ? [workspace.primaryOwnerEmployeeId] : []),
    ...(workspace.responsibleItAdminEmployeeId ? [workspace.responsibleItAdminEmployeeId] : []),
    ...(workspace.emergencyAccount ? [workspace.emergencyAccount.holderEmployeeId] : []),
  ];
}
