import { createZodDto } from '../../../infrastructure/http/dto/zod-dto';
import { z } from 'zod';
import { successEnvelopeSchema } from '../../../infrastructure/http/dto/success-envelope.dto';

const money = z.strictObject({ amount: z.string(), currency: z.string() });
/** The codes a check gave: a year's own, and the two of the data that checks made before the three outcomes still carry. */
const codeSchema = z.enum([
  'BUDGET_OK',
  'HIGH_VALUE',
  'INSUFFICIENT_BUDGET',
  'NO_ACTIVE_BUDGET',
  'CLOSED_OR_EXPIRED_BUDGET_PERIOD',
  'STALE_COST_EVIDENCE',
]);

const pageQuery = {
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
};
export const yearsQuerySchema = z.strictObject(pageQuery);
export const requestParamSchema = z.strictObject({ id: z.uuid() });

const pagination = z.strictObject({
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  totalItems: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
});
const page = <T extends z.ZodType>(item: T) =>
  successEnvelopeSchema(z.strictObject({ items: z.array(item), pagination }));

const checkSchema = z.strictObject({
  id: z.uuid(),
  number: z.number().int().positive(),
  /** What set the check going; the first three are given now, the others are read from checks made before. */
  trigger: z.enum([
    'SUBMISSION',
    'SPEND_DECISION',
    'RESERVE_CONFIRMATION',
    'PLAN_LINE_MOVED',
    'BUDGET_VERSION_APPROVED',
    'FINANCE_OUTCOME_WHILE_WAITING',
  ]),
  /** \`BLOCKED\` or \`SPEND_APPROVAL\`; \`FINANCE_REVIEW\` is read from checks made before the three outcomes. */
  route: z.enum(['BLOCKED', 'FINANCE_REVIEW', 'SPEND_APPROVAL']),
  /**
   * The outcome: within the base, uses the reserve, or blocked. A check made before the three outcomes is read from its code
   * (\`BUDGET_OK\` is within the base, any other is blocked).
   */
  outcome: z.enum(['WITHIN_BASE', 'USES_RESERVE', 'BLOCKED']),
  /** Every reason the request is blocked (the quote is no longer valid, no approved budget, over the reserve); empty unless blocked. */
  blockedReasons: z.array(z.enum(['PRICE_EXPIRED', 'NO_APPROVED_BUDGET', 'OVER_RESERVE'])).max(3),
  /** How much the cost is over what is left of the base; null when it is not over. */
  overBaseBy: money.nullable(),
  /** How much the cost is over what is left with the reserve; null unless blocked for being over it. */
  overBy: money.nullable(),
  primaryCode: codeSchema.nullable(),
  /** What binds the company in all, in the reporting currency; it is never compared with the budget of one year. */
  bindingTotal: money,
  yearCount: z.number().int().positive(),
  ranAt: z.iso.datetime(),
});

/** One year of a check: the cost, and the base, the reserve and what is left at the two levels as the check read them. */
const yearSchema = z.strictObject({
  year: z.number().int(),
  cost: money,
  /** Null for a year of a check made before that had ended: it was not judged. */
  code: z.enum(['BUDGET_OK', 'HIGH_VALUE', 'INSUFFICIENT_BUDGET', 'NO_ACTIVE_BUDGET']).nullable(),
  /** Base and reserve together. Null when the year has no approved version: that is not a budget of 0. */
  budget: money.nullable(),
  base: money.nullable(),
  reserve: money.nullable(),
  held: money.nullable(),
  spent: money.nullable(),
  /** What is left with the reserve; negative when more is held than base and reserve allow. */
  remaining: money.nullable(),
  /** What is left of the base after what is spent, held and waiting to be decided. */
  remainingBase: money.nullable(),
  remainingWithReserve: money.nullable(),
  shareBasisPoints: z.number().int().nonnegative().nullable(),
  /** What the other requests of the Cost Center that wait to be decided as spend cost in the year. */
  pending: money.nullable(),
});

export class YearsQueryDto extends createZodDto(yearsQuerySchema) {}
export class RequestParamDto extends createZodDto(requestParamSchema) {}
export class BudgetCheckResponseDto extends createZodDto(
  successEnvelopeSchema(z.strictObject({ budgetCheck: checkSchema })),
) {}
export class YearListResponseDto extends createZodDto(page(yearSchema)) {}

export type CheckWire = z.infer<typeof checkSchema>;
export type YearWire = z.infer<typeof yearSchema>;
