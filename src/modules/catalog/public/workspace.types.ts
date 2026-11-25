export type WorkspaceRole = 'OWNER' | 'ADMIN';

export interface WorkspaceAdminView {
  employeeId: string;
  role: WorkspaceRole;
}

/** Which workspace a vendor offers a new subscription: the only one, none (one is to be made), or several (the caller must say which). */
export type DefaultWorkspaceOfVendor =
  { kind: 'ONE'; workspaceId: string } | { kind: 'NONE' } | { kind: 'MANY'; workspaceIds: string[] };
