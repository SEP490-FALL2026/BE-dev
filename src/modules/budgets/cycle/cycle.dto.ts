import { z } from 'zod';
import { LINE_TYPES } from '../budget/budget-line-zbb.json';
import { businessDate, responseBusinessDate } from '../../../infrastructure/http/dto/business-date.dto';
import { successEnvelopeSchema } from '../../../infrastructure/http/dto/success-envelope.dto';
import { createZodDto } from '../../../infrastructure/http/dto/zod-dto';

/** An amount Finance types: in the reporting currency of the organization, which the client never names. */
const amountInput = z.strictObject({ amount: z.string().max(40) });
const moneyView = z.strictObject({ amount: z.string(), currency: z.string() });
const year = z.number().int().min(2000).max(2999);

export const openCycleBodySchema = z.strictObject({
  year,
  submissionDeadline: businessDate,
  decisionDeadline: businessDate,
  annualCeiling: amountInput.meta({ description: 'The annual ceiling of the software budget.' }),
  priorities: z.string().trim().min(1).max(2000).optional(),
});

export const updateCycleBodySchema = z.strictObject({
  submissionDeadline: businessDate.optional(),
  decisionDeadline: businessDate.optional(),
  priorities: z.string().trim().min(1).max(2000).nullable().optional(),
  annualCeiling: amountInput.optional(),
  reason: z
    .string()
    .trim()
    .min(1)
    .max(1000)
    .optional()
    .meta({ description: 'Needed when the annual ceiling changes.' }),
});

export const setCeilingsBodySchema = z.strictObject({
  sharedPoolReserve: amountInput.meta({ description: 'The reserve of the shared pool; zero is a value.' }),
  departments: z
    .array(
      z.strictObject({
        departmentId: z.uuid(),
        signedCommitments: amountInput,
        plannedSeats: amountInput,
        priority: amountInput,
        explanation: z.string().trim().min(1).max(2000).optional(),
      }),
    )
    .max(500)
    .refine((rows) => new Set(rows.map((row) => row.departmentId)).size === rows.length, {
      message: 'A department is named once.',
    }),
});

export const cycleYearParamSchema = z.strictObject({ year: z.coerce.number().int().min(2000).max(2999) });

const ceilingView = z.strictObject({
  explanation: z.string().nullable(),
  signedCommitments: moneyView,
  plannedSeats: moneyView,
  priority: moneyView,
  total: moneyView,
});

const cycleSummary = {
  year: z.number().int(),
  submissionDeadline: responseBusinessDate,
  decisionDeadline: responseBusinessDate,
  annualCeiling: moneyView,
  sharedPoolReserve: moneyView.nullable(),
  priorities: z.string().nullable(),
  /** `NOT_PUBLISHED` before the first publication; `PUBLISHED`; `CHANGED_AFTER_PUBLISH` until it is published again. */
  status: z.enum(['NOT_PUBLISHED', 'PUBLISHED', 'CHANGED_AFTER_PUBLISH']),
  openedAt: z.iso.datetime(),
  publishedAt: z.iso.datetime().nullable(),
  firstPublishedAt: z.iso.datetime().nullable(),
  allocated: moneyView.meta({ description: 'The ceilings of the departments and the reserve, added.' }),
  unallocated: moneyView.meta({
    description: 'The annual ceiling less what is allocated; below nothing is shown as zero.',
  }),
};
/** A cycle in the list: the figures without the division. */
export const cycleSummarySchema = z.strictObject(cycleSummary);
/** A cycle with its division: the ceiling of each department, by the id of the department. */
export const cycleSchema = z.strictObject({
  ...cycleSummary,
  ceilings: z.record(z.uuid(), ceilingView).meta({
    description:
      'The ceiling of each department, by department id: at most 500, the bound of the departments of budgetDepartmentCeilingsSet.',
  }),
});

export const listCyclesQuerySchema = z.strictObject({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});

export const baselineQuerySchema = z.strictObject({
  departmentId: z.uuid().optional().meta({
    description:
      'Only this department: the head of a department reads the baseline of their own department by naming it.',
  }),
});

const softwareView = z.strictObject({
  subscriptionId: z.uuid(),
  application: z.string(),
  plan: z.string(),
  seatsPurchased: z.number().int().nullable(),
  seatsAssigned: z.number().int().meta({
    description: 'The seats held (what the warehouse counts: a future start and a service account included).',
  }),
  seatsIdle: z
    .number()
    .int()
    .nullable()
    .meta({ description: 'Purchased and not assigned; null when the purchase has no seats.' }),
  monthlyUnitPrice: moneyView.nullable(),
  monthsRunning: z.number().int().min(0).max(12),
  estimatedAnnualCost: moneyView.nullable().meta({
    description:
      'Seats assigned × monthly price × months running; the seats idle belong to the shared pool. Null when the price is not known.',
  }),
  suggestRenewal: z.boolean().meta({
    description: 'The term ends within the year, or ends before it and still runs today: a Renew line is suggested.',
  }),
});
const baselineDepartmentView = z.strictObject({
  departmentId: z.uuid(),
  departmentCode: z.string(),
  departmentName: z.string(),
  costCenterId: z.uuid().nullable(),
  spentThisYear: moneyView.meta({
    description:
      'The invoices recorded this year against every Cost Center the department ever had (the seat-months of K2 are not in it yet).',
  }),
  estimatedAnnualCost: moneyView,
  hasUnknownCost: z.boolean().meta({
    description:
      'A subscription of the department has no price the baseline can use: its cost is left out of the total.',
  }),
  seatsPurchased: z.number().int(),
  seatsAssigned: z.number().int(),
  softwareTotal: z.number().int(),
  software: z.array(softwareView).max(50).meta({
    description:
      'The active subscriptions the department owns, by id: at most 50 are listed (the bound of the baseline); softwareTotal says how many there are.',
  }),
});
/** What runs today, department by department, and what it is estimated to cost over the year (`FR-5.15`, `R-I03`). */
export const baselineSchema = z.strictObject({
  year: z.number().int(),
  currency: z.string(),
  computedAt: z.iso.datetime(),
  kpi3: z.number().nullable().meta({ description: 'KPI-3 needs usage, which is not collected yet: always null.' }),
  departmentsTotal: z
    .number()
    .int()
    .meta({ description: 'The departments of the year; the first 500 by id are listed.' }),
  departments: z.array(baselineDepartmentView).max(500).meta({
    description:
      'The departments of the year, by id: at most 500 are listed (the most a division of the ceiling names); departmentsTotal says how many there are.',
  }),
});

const packageLineView = z.strictObject({
  position: z.number().int().positive(),
  lineType: z.enum(LINE_TYPES),
  priorityRank: z.number().int().positive(),
  amount: moneyView,
  overCeiling: moneyView.nullable().meta({
    description:
      'The part of the line that carries the proposal over the published ceiling; null when it is not flagged.',
  }),
});
const packageDepartmentView = z.strictObject({
  departmentId: z.uuid(),
  departmentCode: z.string(),
  departmentName: z.string(),
  ceiling: moneyView
    .nullable()
    .meta({ description: 'The ceiling as it stands now, which Finance may still be editing.' }),
  publishedCeiling: moneyView.nullable().meta({
    description:
      'The ceiling the head was told when the cycle was published; null before the first publication. The flags over the ceiling are judged against it (S4-01).',
  }),
  headStatus: z.enum(['HAS_HEAD', 'HEAD_TO_COME', 'NO_HEAD']).meta({
    description:
      'Whether somebody heads the department today, somebody is named to head it later, or nobody is (`QĐ-100h`).',
  }),
  baselineAllowed: z.boolean().meta({
    description:
      'Finance may build the first version of the department from the baseline now: the same check as the version of source BASELINE.',
  }),
  baselineRefusal: z
    .enum([
      'CYCLE_NOT_PUBLISHED',
      'DEPARTMENT_NOT_IN_CYCLE',
      'BEFORE_DEADLINE',
      'HAS_HEAD',
      'HAS_SUCCESSOR',
      'HAS_PROPOSAL',
    ])
    .nullable()
    .meta({ description: 'The first thing that stops it, or null when `baselineAllowed`.' }),
  proposal: z
    .strictObject({
      id: z.uuid(),
      total: moneyView.meta({ description: 'The lines counted: a CANCEL line is shown and not added (QĐ-109c).' }),
      state: z.enum(['SUBMITTED', 'REVIEWED']),
      lines: z.array(packageLineView).max(200).meta({
        description:
          'The lines of the proposal by priority rank, with the flag over the published ceiling and the part that goes over.',
      }),
    })
    .nullable(),
  version: z
    .strictObject({
      id: z.uuid(),
      base: moneyView,
      reserve: moneyView,
      total: moneyView,
      state: z.enum(['SENT', 'CHANGES_REQUESTED', 'APPROVED']),
      origin: z.enum(['PROPOSAL', 'BASELINE_NO_HEAD']),
    })
    .nullable(),
});
/** The year against its ceiling: what the heads proposed, what the versions add up to, and what is left (`AC-12`, `R-I06`). */
export const packageSchema = z.strictObject({
  year: z.number().int(),
  annualCeiling: moneyView,
  sharedPoolReserve: moneyView.nullable(),
  available: moneyView.meta({
    description: 'The annual ceiling less the shared-pool reserve: what the versions may add up to.',
  }),
  proposalsTotal: moneyView,
  proposalsOverAvailable: z.boolean().meta({
    description: 'The proposals add up to more than `available` (the annual ceiling less the shared-pool reserve).',
  }),
  versionsTotal: moneyView.meta({
    description:
      'The versions counted at the annual check, in the currency of the cycle, whether or not their department is listed below.',
  }),
  versionsOutsideListed: moneyView.meta({
    description:
      'Of versionsTotal, what belongs to a Cost Center whose department is not listed (a department that stopped).',
  }),
  versionsInOtherCurrency: z
    .number()
    .int()
    .meta({ description: 'Counted versions left out of the sums because they are not in the currency of the cycle.' }),
  overBy: moneyView.meta({ description: 'What the versions are over `available` by; zero when they are not.' }),
  departmentsTotal: z.number().int(),
  departments: z.array(packageDepartmentView).max(500).meta({
    description:
      'The departments of the year, by id: at most 500 are listed (the most a division of the ceiling names); departmentsTotal says how many there are.',
  }),
});

export type BaselineWire = z.infer<typeof baselineSchema>;
export type PackageWire = z.infer<typeof packageSchema>;

const pagination = z.strictObject({
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  totalItems: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
});

export type CycleWire = z.infer<typeof cycleSchema>;
export type CycleSummaryWire = z.infer<typeof cycleSummarySchema>;

export class OpenCycleBodyDto extends createZodDto(openCycleBodySchema) {}
export class UpdateCycleBodyDto extends createZodDto(updateCycleBodySchema) {}
export class SetCeilingsBodyDto extends createZodDto(setCeilingsBodySchema) {}
export class CycleYearParamDto extends createZodDto(cycleYearParamSchema) {}
export class CycleResponseDto extends createZodDto(successEnvelopeSchema(cycleSchema)) {}
export class BaselineQueryDto extends createZodDto(baselineQuerySchema) {}
export class BaselineResponseDto extends createZodDto(successEnvelopeSchema(baselineSchema)) {}
export class PackageResponseDto extends createZodDto(successEnvelopeSchema(packageSchema)) {}
export class ListCyclesQueryDto extends createZodDto(listCyclesQuerySchema) {}
export class CycleListResponseDto extends createZodDto(
  successEnvelopeSchema(z.strictObject({ items: z.array(cycleSummarySchema), pagination })),
) {}
