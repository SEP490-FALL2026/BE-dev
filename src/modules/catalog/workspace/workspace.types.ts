export type WorkspaceRole = 'OWNER' | 'ADMIN';

export interface WorkspaceEmergencyAccount {
  identity: string;
  occupiesSeat: boolean;
  holderEmployeeId: string;
  /** A business day, `YYYY-MM-DD`. */
  lastReviewedOn: string;
}

export interface WorkspaceAdminRecord {
  employeeId: string;
  role: WorkspaceRole;
}

/** A workspace as the table keeps it, with its administrators and the name of its vendor. */
export interface WorkspaceRecord {
  id: string;
  organizationId: string;
  vendorId: string;
  vendorName: string;
  name: string;
  ownerAccountEmail: string | null;
  primaryOwnerEmployeeId: string | null;
  responsibleItAdminEmployeeId: string | null;
  ownerLimit: number | null;
  adminLimit: number | null;
  ownerTransferProcedure: string | null;
  emergencyAccount: WorkspaceEmergencyAccount | null;
  adminNote: string | null;
  admins: WorkspaceAdminRecord[];
  createdAt: Date;
  updatedAt: Date;
}

export interface WorkspaceListFilter {
  vendorId?: string | undefined;
  page: number;
  pageSize: number;
}

/** The writable fields of a workspace; a field left out stays as it is, `null` clears an optional one. */
export interface WorkspaceChanges {
  name?: string;
  ownerAccountEmail?: string | null;
  ownerLimit?: number | null;
  adminLimit?: number | null;
  ownerTransferProcedure?: string | null;
  emergencyAccount?: WorkspaceEmergencyAccount | null;
  adminNote?: string | null;
}

export type WorkspaceFlag = 'ADMINS_BELOW_MINIMUM' | 'NO_OWNER_EMAIL' | 'NO_RESPONSIBLE';
export type WorkspaceAdminFlag = 'ADMIN_NOT_WORKING';
