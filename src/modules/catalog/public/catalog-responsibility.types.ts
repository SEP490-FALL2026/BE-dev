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
}

/** What a handing over moved, by id: every subscription and application that named the IT Admin who gave them up (`QĐ-111g`). */
export interface ResponsibilitiesTransferred {
  subscriptionIds: string[];
  applicationIds: string[];
}
