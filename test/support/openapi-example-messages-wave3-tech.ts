/**
 * The success `message` each operation redesign wave 3 adds in the tech lane answers with, a part of SUCCESS_MESSAGES (reached through
 * SUCCESS_MESSAGES_PURCHASE_INVOICE) kept in a file of its own so the manifest stays under the size of a support file.
 */
export const SUCCESS_MESSAGES_WAVE3_TECH: Readonly<Record<string, string>> = {
  // W3-10: workspaces.
  workspaceList: 'WORKSPACE.LISTED',
  workspaceCreate: 'WORKSPACE.CREATED',
  workspaceGet: 'WORKSPACE.FETCHED',
  workspaceUpdate: 'WORKSPACE.UPDATED',
  workspaceAdminsSet: 'WORKSPACE.ADMINS_SET',
  workspaceResponsibleItAdminChange: 'WORKSPACE.RESPONSIBLE_CHANGED',
};
