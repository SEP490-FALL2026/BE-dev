import { z } from 'zod';
import { createZodDto } from '../../../infrastructure/http/dto/zod-dto';
import { successEnvelopeSchema } from '../../../infrastructure/http/dto/success-envelope.dto';

/** The most old rights of one person a transfer lists (`API-LIST-DETAIL.1`: the rights of one person are bounded). */
export const OLD_RIGHTS_MAX = 200;

/** Where a transfer stands (P7): waiting, the person keeps the old rights, the grace is over and they are being taken back, closed by the system, cancelled, or taken over by a departure recorded in the grace. */
export const transferPhaseSchema = z.enum(['PENDING', 'IN_GRACE', 'REVOKING', 'CLOSED', 'CANCELLED', 'SUPERSEDED']);

/** The last day the person keeps the rights of the old department and the day they are told once more. */
export const graceSchema = z.strictObject({ endsOn: z.string(), reminderOn: z.string() });

const named = z.strictObject({ id: z.uuid(), name: z.string() });

/** One right of the old department: what it is, whether it is still held, and the task that takes it away. */
export const oldRightSchema = z.strictObject({
  assignmentId: z.uuid(),
  application: named,
  plan: named,
  provisioningType: z.string(),
  /** `HELD` the person still has it and no task works on it, `REVOKING` a task takes it away, `ENDED` the person does not hold it any more. */
  state: z.enum(['HELD', 'REVOKING', 'ENDED']),
  revocation: z.strictObject({ taskId: z.uuid(), status: z.string() }).nullable(),
  /** The person asked for it again in the grace and was given it on the same subscription (R-49): it is not taken back. Always false until the grace ends in a grant. */
  regranted: z.boolean(),
});

/** What went back to the budget of the old department the day the transfer took effect, by currency in the smallest unit as a string. */
export const releasedMoneySchema = z.strictObject({ currency: z.string(), amountMinor: z.string() });

const snapshotRight = z.strictObject({
  assignmentId: z.uuid(),
  applicationName: z.string(),
  planName: z.string(),
  provisioningType: z.string(),
  effectiveFrom: z.string(),
  validUntil: z.string().nullable(),
});

/** The picture of the rights the day the transfer took effect and, once it is closed, what became of each (P7). */
export const transferSnapshotSchema = z.strictObject({
  before: z.strictObject({ takenOn: z.string(), rights: z.array(snapshotRight).max(OLD_RIGHTS_MAX) }).nullable(),
  after: z
    .strictObject({
      takenOn: z.string(),
      rights: z
        .array(
          z.strictObject({ assignmentId: z.uuid(), outcome: z.enum(['REVOKED', 'ENDED', 'REGRANTED', 'TAKEN_OVER']) }),
        )
        .max(OLD_RIGHTS_MAX),
    })
    .nullable(),
});

export type TransferPhaseWire = z.infer<typeof transferPhaseSchema>;
export type GraceWire = z.infer<typeof graceSchema>;
export type OldRightWire = z.infer<typeof oldRightSchema>;
export type TransferSnapshotWire = z.infer<typeof transferSnapshotSchema>;

const department = z.strictObject({ id: z.uuid(), code: z.string(), name: z.string() });

/** The transfer of the person who asks, while the grace lasts (P8): where they come from and go to, until when they keep the old rights, and which. */
export const myTransferSchema = z
  .strictObject({
    id: z.uuid(),
    from: z.strictObject({ department }),
    to: z.strictObject({ department }),
    effectiveOn: z.string(),
    grace: graceSchema,
    rights: z.array(oldRightSchema).max(OLD_RIGHTS_MAX),
  })
  .nullable();

export type MyTransferWire = z.infer<typeof myTransferSchema>;

export class MyTransferResponseDto extends createZodDto(successEnvelopeSchema(myTransferSchema)) {}
