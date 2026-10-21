/** One Cost Center of an allocation as it is kept: its share in hundredths of a percent (6000 is 60%). */
export interface AllocationLineRecord {
  costCenterId: string;
  ratioBp: number;
}

/** One declaration of the allocation of a subscription, never changed after it is recorded. */
export interface AllocationVersion {
  subscriptionId: string;
  version: number;
  lines: AllocationLineRecord[];
  declaredByAppUserId: string;
  declaredAt: Date;
}
