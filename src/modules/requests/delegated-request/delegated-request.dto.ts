import { createZodDto } from '../../../infrastructure/http/dto/zod-dto';
import { z } from 'zod';
import { successEnvelopeSchema } from '../../../infrastructure/http/dto/success-envelope.dto';
import { PROJECT_LABEL_MAX_LENGTH, REASON_MAX_LENGTH, requestSchema } from '../access-request/access-request.dto';
import { businessDate } from '../../../infrastructure/http/dto/business-date.dto';

/** The most requests one sending may make: every person for every tool. A bound against a typo, not a rule of the BRD. */
export const DELEGATED_REQUESTS_MAX = 50;

const reason = z.string().trim().min(1).max(REASON_MAX_LENGTH);

/**
 * What a head sends for the people of the department (`US-03-02` AC-1, AC-7, AC-10): the people, the tools, and the reason and
 * the term they share. One request is made for every person and every tool, each with its own branch and amount. Nothing
 * here says who confirms the need: the head who sends confirms it by sending.
 */
export const delegatedBodySchema = z
  .strictObject({
    beneficiaryEmployeeIds: z
      .array(z.uuid())
      .min(1)
      .max(DELEGATED_REQUESTS_MAX)
      .refine((ids) => new Set(ids).size === ids.length, { message: 'A person is named once.' })
      .meta({ uniqueItems: true }),
    items: z
      .array(
        z.strictObject({
          planId: z.uuid(),
          expectedSpendOn: businessDate.optional(),
        }),
      )
      .min(1)
      .max(DELEGATED_REQUESTS_MAX)
      .refine((items) => new Set(items.map((item) => item.planId)).size === items.length, {
        message: 'A tool is named once.',
      })
      .meta({ description: 'Each tool is named once: no two items carry the same planId.' }),
    businessReason: reason,
    termMonths: z.number().int().min(1).max(120),
    projectLabel: z.string().trim().min(1).max(PROJECT_LABEL_MAX_LENGTH).optional(),
    /** The day the access of a contractor, freelancer or intern ends; every request of the sending carries it (`AC-10`). */
    expectedEndDate: businessDate.optional(),
    /** A term over twelve months is confirmed in so many words (`OI-07a`). */
    termConfirmation: z.strictObject({ reason }).optional(),
  })
  .superRefine((body, ctx) => {
    if (body.beneficiaryEmployeeIds.length * body.items.length > DELEGATED_REQUESTS_MAX) {
      ctx.addIssue({
        code: 'custom',
        path: ['items'],
        message: `At most ${DELEGATED_REQUESTS_MAX} requests are sent at once.`,
      });
    }
  })
  .meta({
    description: `One request is made for every person and every tool, so the people times the tools is at most ${DELEGATED_REQUESTS_MAX}.`,
  });

export class DelegatedBodyDto extends createZodDto(delegatedBodySchema) {}
export class DelegatedResponseDto extends createZodDto(
  successEnvelopeSchema(z.strictObject({ batchId: z.uuid(), requests: z.array(requestSchema) })),
) {}

export const grantQueueQuerySchema = z.strictObject({
  beneficiaryEmployeeId: z.uuid().optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});

const employeeRef = z.strictObject({ employeeId: z.uuid(), employeeCode: z.string(), fullName: z.string() });

/** One request that waits for the IT Admin to carry it out. */
const grantQueueItemSchema = z.strictObject({
  requestId: z.uuid(),
  /** A request for a service account needs the boundary accepted before it is granted. */
  type: z.enum(['GRANT', 'SERVICE_ACCOUNT', 'GROUP_GRANT']),
  /** How many people the request is for: 1 but for a request for a group, whose approved people are a row each. */
  lineCount: z.number().int().positive(),
  /** The verdict of the IT Admin on a service account; null for any other request. */
  boundaryState: z.enum(['PENDING', 'ACCEPTED', 'REJECTED']).nullable(),
  plan: z.strictObject({ planId: z.uuid(), planName: z.string(), applicationName: z.string() }),
  beneficiary: employeeRef,
  requester: employeeRef,
  /** The code the requests a head sent for people in one go share; null for any other request. */
  delegatedBatchId: z.uuid().nullable(),
  /** The day the access of a person who is not staff ends; null for staff. */
  expectedEndDate: z.string().nullable(),
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
