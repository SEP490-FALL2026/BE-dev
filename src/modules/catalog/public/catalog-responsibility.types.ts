/** What one IT Admin answers for in the catalog: the subscriptions and the applications that name them responsible. */
export interface ResponsibilityCounts {
  subscriptions: number;
  applications: number;
}

/**
 * A plan one person administers at the vendor, as the leaving of that person reads it (`QĐ-110k`, X-IT.6): the role they hold in its workspace
 * profile and how many of the other admins recorded still work as IT Admins now.
 */
export interface VendorAdminRole {
  planId: string;
  planName: string;
  applicationId: string;
  applicationName: string;
  role: 'OWNER' | 'ADMIN';
  othersWorking: number;
  /** The workspace the role is held in: one entry for each workspace (W3-10); the plan above is the one it is known by. */
  workspaceId?: string;
  workspaceName?: string;
  vendorId?: string;
  responsibleItAdminEmployeeId?: string | null;
}

/** What a handing over moved, by id: every subscription and application that named the IT Admin who gave them up (`QĐ-111g`). */
export interface ResponsibilitiesTransferred {
  subscriptionIds: string[];
  applicationIds: string[];
  /** The workspaces the IT Admin answered for (W3-10, `QĐ-116o`); they change hands in the same transaction. */
  workspaceIds: string[];
  /** The lots of licenses the IT Admin answered for (W3-24); they change hands in the same transaction, after the subscriptions. */
  licenseLotIds: string[];
}

/** A workspace with administrators who are no longer working as IT Admins, for the hourly alert sweep (W3-12). */
export interface WorkspaceNotWorkingAdmins {
  workspaceId: string;
  organizationId: string;
  responsibleItAdminEmployeeId: string | null;
  workingAdminCount: number;
  notWorkingAdminEmployeeIds: string[];
}
