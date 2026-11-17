import { z } from 'zod';
import { successEnvelopeSchema } from '../../../infrastructure/http/dto/success-envelope.dto';
import { createZodDto } from '../../../infrastructure/http/dto/zod-dto';

const pageQuery = {
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
};
const queryFlag = z.enum(['true', 'false']).transform((value) => value === 'true');
export const listAssignmentsQuerySchema = z.strictObject({
  subscriptionId: z.uuid().optional(),
  planId: z.uuid().optional(),
  employeeId: z.uuid().optional(),
  source: z.enum(['BASELINE', 'HANDOVER', 'REQUEST', 'RENEWAL_CARRY', 'MACHINE_ACCOUNT_CONVERSION']).optional(),
  kind: z.enum(['PERSONAL', 'SERVICE']).optional(),
  activeOnly: queryFlag.optional().meta({
    description:
      'true lists only the rights in force today: not ended, not failed and not cancelled, one that begins later included. False or absent lists every assignment, the ended ones too.',
  }),
  ...pageQuery,
});
export const assignmentIdParamSchema = z.strictObject({ id: z.uuid() });
export const subscriptionIdParamSchema = z.strictObject({ id: z.uuid() });

export const assignmentSchema = z.strictObject({
  id: z.uuid(),
  source: z.enum(['BASELINE', 'HANDOVER', 'REQUEST', 'RENEWAL_CARRY', 'MACHINE_ACCOUNT_CONVERSION']),
  kind: z.enum(['PERSONAL', 'SERVICE']),
  planId: z.uuid(),
  subscriptionId: z.uuid().nullable(),
  employeeId: z.uuid(),
  accountIdentifier: z.string(),
  reason: z.string().nullable(),
  costCenterId: z.uuid().nullable(),
  owningDepartmentId: z.uuid().nullable(),
  effectiveFrom: z.string(),
  effectiveFromBasis: z.enum(['ACTUAL', 'RECORDED']),
  grantedOn: z.string().nullable(),
  effectiveFromLabel: z.string().nullable(),
  validUntil: z.string().nullable(),
  expectedEndDate: z.string().nullable(),
  predecessorId: z.uuid().nullable(),
  isMachineAccount: z.boolean(),
  machineAccountNote: z.string().nullable(),
  failedAt: z.iso.datetime().nullable(),
  cancelledAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
});
const assignmentSummarySchema = assignmentSchema.extend({
  employee: z.strictObject({ employeeId: z.uuid(), employeeCode: z.string(), fullName: z.string() }),
  plan: z.strictObject({
    planId: z.uuid(),
    planName: z.string(),
    applicationName: z.string(),
    logoUrl: z.string().nullable().meta({
      description:
        'The https link to the logo image of the application that the IT Admin pasted, or null. The server never checks it: it may be broken, so show the first letter of the name when the image does not load.',
    }),
  }),
  costCenter: z.strictObject({ id: z.uuid(), code: z.string(), name: z.string() }).nullable(),
  revocation: z
    .strictObject({
      taskId: z.uuid(),
      status: z.enum(['QUEUED', 'RETRY_SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'FAILED', 'CLOSED_FAILED', 'CANCELLED']),
      claimableNow: z.boolean().meta({
        description:
          'False while a reason asks for a day not before that has not come: the task cannot be taken or completed yet.',
      }),
    })
    .nullable()
    .meta({
      description:
        'The revocation task that is open for this seat (the task of the provisioning routes), or null when nobody is taking it back: only then is there something to press "Revoke" on. Read status as well as claimableNow before offering it: QUEUED and IN_PROGRESS can be taken and completed, FAILED waits for a decision of the IT Admin (try again, hand off or close as failed) and can be neither taken nor completed (409), RETRY_SCHEDULED is tried again by the connector by itself. A key (K4) is revoked through its holder: the row of the person who holds it.',
    }),
});
const pagination = z.strictObject({
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  totalItems: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
});

export class ListAssignmentsQueryDto extends createZodDto(listAssignmentsQuerySchema) {}
export class AssignmentIdParamDto extends createZodDto(assignmentIdParamSchema) {}
export class SubscriptionSeatsParamDto extends createZodDto(subscriptionIdParamSchema) {}
export class AssignmentPageResponseDto extends createZodDto(
  successEnvelopeSchema(z.strictObject({ items: z.array(assignmentSummarySchema), pagination })),
) {}
export class SeatUsageResponseDto extends createZodDto(
  successEnvelopeSchema(
    z.strictObject({
      subscriptionId: z.uuid(),
      purchased: z.number().int().nonnegative().nullable(),
      occupied: z.number().int().nonnegative(),
      free: z.number().int().nonnegative().nullable(),
      asOf: z.string(),
    }),
  ),
) {}
