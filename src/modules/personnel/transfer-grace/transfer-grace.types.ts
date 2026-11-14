import type { BusinessDate } from '../../../core/business-date';
import type { TransferSnapshotBefore } from './transfer-snapshot.json';

/** What the grace of a transfer needs to know of it when it takes effect (a `TransferRecord` has all of it; this folder does not import the capability of the transfer). */
export interface GraceTransferFacts {
  id: string;
  organizationId: string;
  employeeId: string;
  fromDepartmentId: string;
  toDepartmentId: string;
  effectiveOn: BusinessDate;
}

/** What opening the grace did (nothing when it was open already). */
export interface GraceOpened {
  graceEndsOn: BusinessDate;
  graceReminderOn: BusinessDate;
  rightCount: number;
  requestsCancelled: number;
  requestsToCheck: number;
}

/** A transfer a pass of the sweep looks at: who it is about, read before the lock. */
export interface SweptRef {
  id: string;
  employeeId: string;
}

/** A transfer held for the sweep, read after the lock: what the telling, the revocation and the closing decide on. */
export interface HeldTransfer extends GraceTransferFacts {
  status: 'PENDING' | 'EFFECTIVE' | 'CANCELLED';
  closed: boolean;
  graceEndsOn: BusinessDate | null;
  graceReminderOn: BusinessDate | null;
  /** The person was told once more already. */
  reminded: boolean;
  /** The picture of the rights; null on a transfer that took effect before the grace existed. */
  snapshotBefore: TransferSnapshotBefore | null;
}
