/** What one IT Admin answers for in the catalog: the subscriptions and the applications that name them responsible. */
export interface ResponsibilityCounts {
  subscriptions: number;
  applications: number;
}

/** What a handing over moved, by id: every subscription and application that named the IT Admin who gave them up (`QĐ-111g`). */
export interface ResponsibilitiesTransferred {
  subscriptionIds: string[];
  applicationIds: string[];
}
