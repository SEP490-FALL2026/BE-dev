import { z } from 'zod';
import { responseBusinessDate } from '../../../infrastructure/http/dto/business-date.dto';
import { successEnvelopeSchema } from '../../../infrastructure/http/dto/success-envelope.dto';
import { createZodDto } from '../../../infrastructure/http/dto/zod-dto';
import { employeeRef, moneySchema } from '../access-request/access-request.dto';

const pagination = z.strictObject({
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  totalItems: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
});

const requestType = z.enum(['GRANT', 'SERVICE_ACCOUNT', 'RENEWAL', 'GROUP_GRANT']);

/**
 * What the caller asks of the queue of the need steps they hold: a page, and optionally one kind of request. There is no filter by
 * person or department: the queue is what the system gave the caller, and nothing else.
 */
export const needQueueQuerySchema = z.strictObject({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  type: requestType.optional().meta({
    description:
      'Only the requests of this kind: GRANT (one person), GROUP_GRANT (several people, decided line by line), RENEWAL (a right that is renewed) or SERVICE_ACCOUNT.',
  }),
});

/**
 * A need step that waits for the caller: what the request is, who asked and who it is for, how long the step may wait, and what the
 * caller decides about it. It carries no figure of the budget, no use of the software and no judgement of the software against a
 * standard set: those are for other readers.
 */
const needQueueItemSchema = z.strictObject({
  requestId: z.uuid(),
  stepId: z.uuid(),
  /** The kind of step the row is, the same key the list of the spend steps carries, so a client can put the two lists in one. */
  stepKind: z.literal('NEED'),
  /** The role the caller holds in this step as the system gave it: the head, the spending approver or the fallback approver. */
  deciderRole: z.enum(['MANAGER', 'SPENDING_APPROVER', 'FALLBACK_APPROVER']),
  type: requestType,
  openedAt: z.iso.datetime(),
  /** When the step was given to the caller; it is later than `openedAt` when the step was handed over. */
  assignedAt: z.iso.datetime().nullable(),
  slaWorkingDays: z.number().int().positive(),
  /** The business day the step is due, counted on the calendar of the organization. */
  dueOn: responseBusinessDate,
  plan: z.strictObject({ planId: z.uuid(), planName: z.string(), applicationName: z.string() }).nullable(),
  /** The name of software that is not in the catalog yet. */
  softwareName: z.string().nullable(),
  requester: employeeRef,
  /** The person it is for; null for a request for a group, whose people are read as lines. */
  beneficiary: employeeRef.nullable(),
  /** How many people the caller decides here: the person of the request, or the people of the group still waiting on this step. */
  lineCount: z.number().int().nonnegative(),
  department: z.strictObject({ id: z.uuid(), code: z.string(), name: z.string() }),
  /** The first part of the reason the sender gave; the request has all of it. */
  businessReasonExcerpt: z.string(),
  termMonths: z.number().int().positive(),
  /** Approving needs the caller to confirm the term in so many words (a term over twelve months). */
  /** What this request costs, as the request itself says; never what is left of a budget. */
  pricing: z.strictObject({
    status: z.enum(['NOT_APPLICABLE', 'PRICED', 'MISSING']),
    amount: moneySchema.nullable(),
  }),
  /** The same person holds this step and the spend step of the request. */
  samePersonAsSpend: z.boolean(),
});

export class NeedQueueQueryDto extends createZodDto(needQueueQuerySchema) {}
export class NeedQueueResponseDto extends createZodDto(
  successEnvelopeSchema(z.strictObject({ items: z.array(needQueueItemSchema), pagination })),
) {}

export type NeedQueueItemWire = z.infer<typeof needQueueItemSchema>;
