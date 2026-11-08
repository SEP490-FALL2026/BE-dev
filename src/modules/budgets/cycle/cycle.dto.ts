import { z } from 'zod';
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
export class ListCyclesQueryDto extends createZodDto(listCyclesQuerySchema) {}
export class CycleListResponseDto extends createZodDto(
  successEnvelopeSchema(z.strictObject({ items: z.array(cycleSummarySchema), pagination })),
) {}
