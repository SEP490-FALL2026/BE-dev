import { createZodDto } from '../../../infrastructure/http/dto/zod-dto';
import { z } from 'zod';
import { successEnvelopeSchema } from '../../../infrastructure/http/dto/success-envelope.dto';
import {
  REASON_MAX_LENGTH,
  employeeRef,
  moneySchema,
  pricingSchema,
  requestSchema,
  termMonthsSchema,
} from '../access-request/access-request.dto';
import { LINE_STATES, READABLE_CANCEL_CAUSES } from '../access-request/group-request.types';

/**
 * The most people the body of a request for a group may carry: a bound against abuse, far above what a head may name. The limit of
 * the people a sender names (ten for an Employee, a hundred for a head) is a rule with its own answer, not a shape of the body.
 */
export const GROUP_BODY_LINES_MAX = 1000;

const reason = z.string().trim().min(1).max(REASON_MAX_LENGTH);

/**
 * What the sender gives for a group (`US-05-17`, `US-05-02` AC-2): the plan, the people, and the reason and the time of use in months
 * they share (`QĐ-111i`). The branch, the Cost Center, the amount and who decides are fixed by the system; a person with a term whose
 * contract ends sooner is cut at the end of it, on their own line (R-38).
 */
export const groupBodySchema = z.strictObject({
  planId: z.uuid(),
  lines: z
    .array(z.strictObject({ employeeId: z.uuid() }))
    .min(1)
    .max(GROUP_BODY_LINES_MAX),
  businessReason: reason,
  /** The time of use of every person named, in months; null for no end, and then each person who has a term is refused (`FR-2.8`, `INV-07`). */
  termMonths: termMonthsSchema.optional(),
});

const LINE_REASONS = [
  'HEAD_IN_GROUP',
  'SPENDING_APPROVER',
  'OUTSIDE_DEPARTMENT',
  'NOT_ACTIVE',
  'EMAIL_REQUIRED',
  'HAS_ACCESS',
  'HAS_OPEN_REQUEST',
  'TERM_REQUIRED',
  'TERM_LONG_TERM_NOT_ALLOWED',
  'TERM_CONTRACT_ENDED',
  'OPEN_LIMIT_REACHED',
] as const;

/** What the check of a group says: every reason of every person at once, and what it would cost; nothing is written. */
const checkSchema = z.strictObject({
  plan: z.strictObject({
    eligible: z.boolean(),
    reason: z.enum(['KIND_NOT_MULTI_SEAT', 'NOT_PAID_SOFTWARE']).nullable(),
  }),
  /** The most people the sender may name, when they named more. */
  tooManyLines: z.strictObject({ max: z.number().int().positive() }).nullable(),
  /** The fewest different people a request for a group names, when fewer were named. */
  tooFewLines: z.strictObject({ min: z.number().int().positive() }).nullable(),
  /**
   * What is wrong with the time of use for the plan as a whole, or null (`QĐ-111i`); a person with a term who gets no months, or no end, is
   * refused on their own line (`TERM_REQUIRED`, `TERM_LONG_TERM_NOT_ALLOWED`), and so is one whose contract ended before today
   * (`TERM_CONTRACT_ENDED`); one whose contract ends sooner than the months is cut, not refused.
   */
  termRefusal: z
    .enum(['TERM_REQUIRED', 'TERM_MONTHS_OUT_OF_RANGE', 'TERM_NOT_ASKED', 'TERM_LONG_TERM_NOT_ALLOWED'])
    .nullable(),
  lines: z.array(
    z.strictObject({
      employeeId: z.uuid(),
      ok: z.boolean(),
      reason: z.enum([...LINE_REASONS, 'DUPLICATE_LINE']).nullable(),
    }),
  ),
  lineCount: z.number().int().nonnegative(),
  hasSpendStep: z.boolean(),
  pricing: pricingSchema,
  /** What one person of the request costs for the months counted; null when the plan has no price or nobody is named. */
  amountPerPerson: moneySchema.nullable(),
});

const candidatesQuerySchema = z.strictObject({
  q: z.string().trim().min(1).max(100).optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});

/** A person of the department of the caller who may be named: their name and work email, and nothing else. */
const candidateSchema = z.strictObject({ employeeId: z.uuid(), fullName: z.string(), workEmail: z.string() });

const pagination = z.strictObject({
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  totalItems: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
});

const lineDecisionSchema = z.strictObject({
  decision: z.enum(['APPROVED', 'REJECTED']),
  reason: z.string().nullable(),
  decidedBy: employeeRef,
  deciderRole: z.enum(['MANAGER', 'SPENDING_APPROVER']),
  decidedAt: z.iso.datetime(),
});

/** One person of a request for a group, with what became of them apart from the others (`US-05-17` AC-4, AC-6, AC-9). */
const lineSchema = z.strictObject({
  employee: employeeRef,
  position: z.number().int().positive(),
  state: z.enum(LINE_STATES),
  /** The need step that holds this person: the head's for the others, a step of its own for the head. */
  needStep: z.strictObject({
    id: z.uuid(),
    state: z.enum(['PENDING', 'WAITING', 'APPROVED', 'REJECTED', 'CLOSED', 'NOT_REQUIRED']),
    assignee: employeeRef.nullable(),
  }),
  /** The day the access of this person ends, when they are not staff. */
  expectedEndDate: z.string().nullable(),
  needDecision: lineDecisionSchema.nullable(),
  spendDecision: lineDecisionSchema.nullable(),
  /** What this person costs for the whole term before the tax: the amount of the request over the people it is priced for. */
  cost: moneySchema.nullable(),
  /** What the person stands for in the commitment, over all the years; null until the spend is approved. */
  share: moneySchema.nullable(),
  endedAt: z.iso.datetime().nullable(),
  endedBy: employeeRef.nullable(),
  endReason: z.string().nullable(),
  /**
   * Why the line ended as cancelled: the IT Admin closed it, the conversion command because the spending approver is a party, or the
   * system because the person left or was moved to another department (`QĐ-110d`, `QĐ-110o`).
   */
  cancelCause: z.enum(READABLE_CANCEL_CAUSES).nullable(),
});

export class GroupBodyDto extends createZodDto(groupBodySchema) {}
export class GroupCheckResponseDto extends createZodDto(successEnvelopeSchema(checkSchema)) {}
export class GroupResponseDto extends createZodDto(successEnvelopeSchema(z.strictObject({ request: requestSchema }))) {}
export class GroupCandidatesQueryDto extends createZodDto(candidatesQuerySchema) {}
export class GroupCandidatesResponseDto extends createZodDto(
  successEnvelopeSchema(z.strictObject({ items: z.array(candidateSchema), pagination })),
) {}
export class LinesQueryDto extends createZodDto(
  z.strictObject({
    page: z.coerce.number().int().positive().default(1),
    pageSize: z.coerce.number().int().positive().max(100).default(20),
  }),
) {}
export class LinesResponseDto extends createZodDto(
  successEnvelopeSchema(z.strictObject({ items: z.array(lineSchema), pagination })),
) {}

export type GroupCheckWire = z.infer<typeof checkSchema>;
export type GroupLineWire = z.infer<typeof lineSchema>;
