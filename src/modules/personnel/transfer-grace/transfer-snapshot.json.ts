import { z } from 'zod';
import { isBusinessDate } from '../../../core/business-date';
import { nullableJsonColumn } from '../../../infrastructure/database/json-column';

const businessDate = z.string().refine(isBusinessDate);

/** One personal right of the old department as the snapshot keeps it: what it is, and the days it began and ends. */
const rightSchema = z.object({
  assignmentId: z.string(),
  applicationId: z.string(),
  applicationName: z.string(),
  planId: z.string(),
  planName: z.string(),
  provisioningType: z.string(),
  effectiveFrom: businessDate,
  validUntil: businessDate.nullable(),
});

const moneySchema = z.object({ currency: z.string(), amountMinor: z.string() });

/**
 * What the person held and what the system did the day the transfer took effect (`QĐ-110r`: the picture of the rights before). Written once,
 * with the grace: the rights of the old department, the commitment given back to its budget, and the requests of the old department closed.
 */
const beforeSchema = z.object({
  takenOn: businessDate,
  rights: z.array(rightSchema),
  commitmentsReleased: z.array(moneySchema),
  requestsCancelled: z.number().int().nonnegative(),
  requestsToCheck: z.number().int().nonnegative(),
});

/** What is left of those rights when the transfer closes (written by the closing, MF3-C.2): what became of each right. */
const afterSchema = z.object({
  takenOn: businessDate,
  rights: z.array(
    z.object({ assignmentId: z.string(), outcome: z.enum(['REVOKED', 'ENDED', 'REGRANTED', 'TAKEN_OVER']) }),
  ),
});

export type TransferSnapshotBefore = z.output<typeof beforeSchema>;
export type TransferSnapshotAfter = z.output<typeof afterSchema>;
export type SnapshotRight = z.output<typeof rightSchema>;

/** A right as the snapshot keeps it, from a personal seat as the licensing facade gives it. */
export const snapshotRightOf = (seat: SnapshotRight): SnapshotRight => ({
  assignmentId: seat.assignmentId,
  applicationId: seat.applicationId,
  applicationName: seat.applicationName,
  planId: seat.planId,
  planName: seat.planName,
  provisioningType: seat.provisioningType,
  effectiveFrom: seat.effectiveFrom,
  validUntil: seat.validUntil,
});

/** `department_transfers.snapshot_before`: NULL for a transfer that took effect before the grace existed. */
export const snapshotBeforeJson = nullableJsonColumn({
  table: 'department_transfers',
  column: 'snapshot_before',
  schema: beforeSchema,
  encode: (snapshot) => snapshot,
});

/** `department_transfers.snapshot_after`: NULL until the transfer is closed by the system. */
export const snapshotAfterJson = nullableJsonColumn({
  table: 'department_transfers',
  column: 'snapshot_after',
  schema: afterSchema,
  encode: (snapshot) => snapshot,
});
