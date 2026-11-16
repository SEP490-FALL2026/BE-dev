import { z } from 'zod';
import { successEnvelopeSchema } from '../../../infrastructure/http/dto/success-envelope.dto';
import { responseBusinessDate } from '../../../infrastructure/http/dto/business-date.dto';
import { createZodDto } from '../../../infrastructure/http/dto/zod-dto';
import { explanationStatusSchema, explanationViewSchema } from './budget-review-explanation.dto';

const moneyView = z.strictObject({ amount: z.string(), currency: z.string() });
const light = z.enum(['GREEN', 'YELLOW', 'RED', 'UNDER']).meta({
  description:
    'The light of the Cost Center at the close: RED when the forecast is above the base and the reserve; YELLOW when it is above the base or the pace is above 110 % of the schedule; UNDER from June when the forecast is under 70 % of the base; GREEN otherwise. It only warns: it blocks no request.',
});

export const createReviewPeriodBodySchema = z.strictObject({
  year: z.number().int().min(2000).max(2100).meta({ description: 'The fiscal year of the month to close, as YYYY.' }),
  month: z.number().int().min(1).max(12).meta({
    description: 'The month to close, 1 to 12. It must have ended: a month is closed from the day after its last day.',
  }),
});

export const reviewPeriodQuerySchema = z.strictObject({
  year: z.coerce.number().int().min(2000).max(2100).optional().meta({ description: 'Only the periods of this year.' }),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});

export const reviewPeriodDetailQuerySchema = z.strictObject({
  page: z.coerce.number().int().positive().default(1).meta({ description: 'The page of the lines.' }),
  pageSize: z.coerce
    .number()
    .int()
    .positive()
    .max(100)
    .default(50)
    .meta({ description: 'The lines in a page, at most 100.' }),
});

export const reviewPeriodIdParamSchema = z.strictObject({ id: z.uuid() });

export const signReviewPeriodBodySchema = z.strictObject({
  note: z
    .string()
    .trim()
    .min(1)
    .max(2000)
    .optional()
    .meta({ description: 'What Finance writes on the minutes when it signs; optional.' }),
});

const person = z.strictObject({ employeeId: z.uuid(), employeeCode: z.string(), fullName: z.string() });

const periodSchema = z.strictObject({
  id: z.uuid(),
  year: z.number().int(),
  month: z.number().int(),
  kind: z
    .enum(['MONTH', 'QUARTER'])
    .meta({ description: 'QUARTER for March, June and September, the quarterly review; MONTH for the others.' }),
  state: z.enum(['SNAPSHOT', 'AWAITING_EXPLANATIONS', 'SIGNED']).meta({
    description:
      'SNAPSHOT: closed on its figures. AWAITING_EXPLANATIONS: a quarter waiting for the explanations of the departments. SIGNED: signed by Finance, for good.',
  }),
  currency: z.string(),
  closedBy: person.nullable(),
  closedAt: z.iso.datetime(),
  explanationsDueOn: responseBusinessDate.nullable().meta({
    description:
      'For a quarter, the last day the heads of departments are asked to explain by (the fifth working day from the close); null for a month. Past it an explanation is still taken: the heads are reminded on that day and every Monday until they explain or Finance signs.',
  }),
  signedBy: person.nullable(),
  signedAt: z.iso.datetime().nullable(),
  note: z.string().nullable(),
  lightCounts: z
    .strictObject({ GREEN: z.number().int(), YELLOW: z.number().int(), RED: z.number().int(), UNDER: z.number().int() })
    .meta({ description: 'How many Cost Centers of the period have each light (for a manager, only their own).' }),
  company: z
    .strictObject({
      spent: moneyView.meta({
        description: 'What the company spent in the year up to the close, the invoices of the shared pool in it.',
      }),
      sharedPoolUnallocated: moneyView.meta({
        description:
          'The line "not allocated, shared pool" of the year up to the close: the seats paid for at the price of a month less the seat-months charged to departments.',
      }),
      sharedPoolReserve: moneyView.nullable().meta({
        description: 'The reserve of the shared pool of the budget cycle of the year, null when the cycle has none.',
      }),
      sharedPoolOverReserve: z
        .boolean()
        .nullable()
        .meta({ description: 'Whether the line of the pool is above the reserve; null when there is no reserve.' }),
      annualCeiling: moneyView.nullable(),
    })
    .nullable()
    .meta({ description: 'The figures of the company; Finance and the spending approver only, null for a manager.' }),
});

const lineSchema = z.strictObject({
  id: z.uuid(),
  costCenter: z.strictObject({ id: z.uuid(), code: z.string(), name: z.string() }).nullable(),
  base: moneyView.meta({ description: 'The effective base of the year at the close.' }),
  reserve: moneyView,
  spent: moneyView.meta({
    description:
      'What the Cost Center spent through the end of the month closed, by the month each invoice or seat-month pays for, the seat-months of the shared pool in it.',
  }),
  spentAfterMonth: moneyView.meta({
    description:
      'What was already recorded for the months after the one closed when it was closed: spent, and it took commitments down, so the forecast and what is left count it and the pace does not.',
  }),
  changedAfterSnapshot: moneyView.meta({
    description:
      'What the spent of the month closed is now over what the picture kept: an invoice that came late for a month already closed, or a seat-month charged again. The picture does not move; this is the change after it (negative when something was given back).',
  }),
  committed: moneyView.meta({ description: 'What its commitments still hold.' }),
  pendingSpend: moneyView.meta({ description: 'What its requests that wait for the spend decision would cost.' }),
  remaining: moneyView.meta({
    description:
      'The budget (base and reserve) less spent, spent after the month, held and waiting; negative when it is over.',
  }),
  variancePpm: z.number().int().meta({
    description:
      'The difference k of the invoices of the commitments since 01/01, in millionths: what they cost (the price paid, with the card fee and the tax that cannot be deducted) over the price in the commitment, less one; 0 with no such invoice.',
  }),
  priceIncrease: moneyView.meta({
    description:
      'The price increase already known: the rise of the price of a seat over what the commitment was made at, for the seats and months left; a price that fell adds nothing.',
  }),
  forecast: moneyView.meta({
    description:
      'The forecast of the end of the year: spent + spent after the month + (held + waiting) x (1 + k) + price increase already known.',
  }),
  paceBasisPoints: z.number().int().nullable().meta({
    description:
      'The spent through the end of the month over the base of the months gone, in hundredths of a percent (11.200 is 112 %), rounded up; null when the Cost Center has no base.',
  }),
  light,
  explanationStatus: explanationStatusSchema,
  explanation: explanationViewSchema.nullable().meta({
    description: 'What the head of the department explained of the line; null until they do.',
  }),
});

const pagination = z.strictObject({
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  totalItems: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
});

export class CreateReviewPeriodBodyDto extends createZodDto(createReviewPeriodBodySchema) {}
export class ReviewPeriodQueryDto extends createZodDto(reviewPeriodQuerySchema) {}
export class ReviewPeriodDetailQueryDto extends createZodDto(reviewPeriodDetailQuerySchema) {}
export class ReviewPeriodIdParamDto extends createZodDto(reviewPeriodIdParamSchema) {}
export class SignReviewPeriodBodyDto extends createZodDto(signReviewPeriodBodySchema) {}

export class ReviewPeriodResponseDto extends createZodDto(successEnvelopeSchema(periodSchema)) {}
export class ReviewPeriodListResponseDto extends createZodDto(
  successEnvelopeSchema(z.strictObject({ items: z.array(periodSchema), pagination })),
) {}
export class ReviewPeriodDetailResponseDto extends createZodDto(
  successEnvelopeSchema(
    z.strictObject({
      period: periodSchema,
      items: z.array(lineSchema).meta({
        description: 'A page of the lines, the Cost Centers that need the eye first: red, yellow, under, then green.',
      }),
      pagination,
    }),
  ),
) {}

export type ReviewPeriodWire = z.infer<typeof periodSchema>;
export type ReviewLineWire = z.infer<typeof lineSchema>;
