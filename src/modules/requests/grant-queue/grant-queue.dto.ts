import { z } from 'zod';
import { successEnvelopeSchema } from '../../../infrastructure/http/dto/success-envelope.dto';
import { createZodDto } from '../../../infrastructure/http/dto/zod-dto';

/** The most acts a grant task offers at once: the seven there are (take, complete, report, retry, hand off, close, cancel). */
export const GRANT_EXECUTION_ACTIONS_MAX = 7;

/** Where the grant of one person stands: not begun, begun and not over, or over (completed, or closed as failed). */
const queueState = z.enum(['WAITING', 'EXECUTING', 'DONE']);

export const grantQueueQuerySchema = z.strictObject({
  beneficiaryEmployeeId: z.uuid().optional(),
  planId: z
    .uuid()
    .optional()
    .meta({ description: 'Only the people waiting for this plan: what the stock of the plan lists to grant from.' }),
  state: queueState.optional().meta({
    description:
      'Only the people whose grant stands here: WAITING (no task yet), EXECUTING (a task is being worked or has failed and waits for a decision) or DONE (completed, or closed as failed). Without it, every state is listed, the waiting ones first.',
  }),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});

const employeeRef = z.strictObject({ employeeId: z.uuid(), employeeCode: z.string(), fullName: z.string() });

/** The person to grant to: the IT Admin invites them at the vendor with their work email (`QĐ-87b`, `FR-2.9`), so it is shown here. */
const beneficiaryRef = employeeRef.extend({
  workEmail: z.string().nullable().meta({
    description:
      'The work email on the profile, as stored (not normalized): the address the grant is made to when the IT Admin names no other one; null when the profile has none.',
  }),
});

/** One request that waits for the IT Admin to carry it out. */
const grantQueueItemSchema = z.strictObject({
  requestId: z.uuid(),
  type: z
    .enum(['GRANT', 'SERVICE_ACCOUNT', 'GROUP_GRANT'])
    .describe(
      'SERVICE_ACCOUNT is on records of the earlier releases only: no request for a service account is made any more.',
    ),
  /** How many people the request is for: 1 but for a request for a group, whose approved people are a row each. */
  lineCount: z.number().int().positive(),
  /** The verdict of the IT Admin on a service account; null for any other request. */
  boundaryState: z.enum(['PENDING', 'ACCEPTED', 'REJECTED']).nullable(),
  plan: z.strictObject({
    planId: z.uuid(),
    planName: z.string(),
    applicationName: z.string(),
    logoUrl: z.string().nullable().meta({
      description:
        'The https link to the logo image of the application that the IT Admin pasted, or null. The server never checks it: it may be broken, so show the first letter of the name when the image does not load.',
    }),
  }),
  department: z.strictObject({ id: z.uuid(), name: z.string() }).meta({
    description: 'The department the request was sent for: the IT Admin works the departments they are in charge of.',
  }),
  beneficiary: beneficiaryRef,
  state: queueState,
  /** The grant task of this person; null while the grant has not begun, and for a request that ended without one. */
  execution: z
    .strictObject({
      taskId: z.uuid(),
      status: z.enum(['QUEUED', 'RETRY_SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'FAILED', 'CLOSED_FAILED', 'CANCELLED']),
      failureReason: z.string().nullable(),
      claimedBy: z.uuid().nullable().meta({
        description:
          'The account of the IT Admin who took the task, the same value as claimedBy of the task; null while nobody has. Pressing "Grant" takes it, so another IT Admin sees here that the work is already someone\'s.',
      }),
      availableActions: z
        .array(z.enum(['CLAIM', 'COMPLETE', 'REPORT_FAILURE', 'RETRY', 'HAND_OFF', 'CLOSE_FAILED', 'CANCEL']))
        .max(GRANT_EXECUTION_ACTIONS_MAX)
        .meta({
          description:
            'What the IT Admin may do next on the task, each one a route of the provisioning task: take it, complete it with evidence, report it as not done, try it again, hand it to a person, close it as failed, or cancel it when the requester withdrew.',
        }),
    })
    .nullable(),
  requester: employeeRef,
  /** The day the access of a person who is not staff ends; null for staff. */
  expectedEndDate: z.string().nullable(),
  /**
   * What the shared pool of the plan holds today (`BR-MF1-09`): `SEATS` for a K2 plan, `KEYS` for a K4 plan, `NONE` for any other kind (nothing
   * counted). `free` is what a grant can take without buying; `inRevocation` is held by a right whose revocation is still open.
   */
  stock: z.strictObject({
    kind: z.enum(['SEATS', 'KEYS', 'NONE']),
    free: z.number().int().nonnegative(),
    inRevocation: z.number().int().nonnegative(),
  }),
  submittedAt: z.iso.datetime(),
});

const pagination = z.strictObject({
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  totalItems: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
});

export class GrantQueueQueryDto extends createZodDto(grantQueueQuerySchema) {}
export class GrantQueueResponseDto extends createZodDto(
  successEnvelopeSchema(z.strictObject({ items: z.array(grantQueueItemSchema), pagination })),
) {}

export type GrantQueueItemWire = z.infer<typeof grantQueueItemSchema>;
