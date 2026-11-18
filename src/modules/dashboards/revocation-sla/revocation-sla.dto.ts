import { z } from 'zod';
import { addDays } from '../../../core/business-date';
import { businessDate, responseBusinessDate } from '../../../infrastructure/http/dto/business-date.dto';
import { successEnvelopeSchema } from '../../../infrastructure/http/dto/success-envelope.dto';
import { createZodDto } from '../../../infrastructure/http/dto/zod-dto';

/** The longest range of days a report reads: a year, so one read is bounded whatever the data (the days the windows of revocations open on). */
export const REPORT_MAX_DAYS = 366;

/** The most rows one page of the report holds (`pageSize`), and so the most the array `rows` has. */
export const REPORT_PAGE_SIZE_MAX = 100;

const queryShape = {
  from: businessDate.optional().meta({
    description:
      'A calendar date as YYYY-MM-DD; it must exist (2026-02-30 is refused). The first day the windows of revocations open on; the first of this month when left out.',
  }),
  to: businessDate.optional().meta({
    description:
      'A calendar date as YYYY-MM-DD; it must exist (2026-02-30 is refused). The last day they open on; today when left out. At most 366 days after `from`.',
  }),
  source: z.enum(['OFFBOARDING', 'TRANSFER']).optional().meta({
    description: 'Only the departures (`OFFBOARDING`) or only the transfers (`TRANSFER`); both when left out.',
  }),
  groupBy: z.enum(['itAdmin', 'department']).default('department').meta({
    description: 'What each row of the report is for: the IT Admin the tasks were given to, or the department.',
  }),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(REPORT_PAGE_SIZE_MAX).default(20),
};

const querySchema = z
  .strictObject(queryShape)
  .refine(
    (query) =>
      !query.from || !query.to || (query.from <= query.to && query.to <= addDays(query.from, REPORT_MAX_DAYS - 1)),
    { message: 'The range must start on or before its end and last at most 366 days.', path: ['to'] },
  );

/** The figures of a set of departures and transfers, the same at the top of the report and in each row. */
const figures = {
  completed: z.number().int().nonnegative().meta({
    description: 'The departures or transfers whose every task of revocation is completed.',
  }),
  onTime: z.number().int().nonnegative().meta({
    description: 'Of those, the ones completed by the first working day of their window, the deadline of the IT Admin.',
  }),
  overdueOpen: z.number().int().nonnegative().meta({
    description:
      'Open and past the deadline today. A departure is overdue as the list of departures says (`revocationOverdue=true`), a right with no task opened included; a transfer, by a task still to do.',
  }),
  medianWorkingDays: z.number().nonnegative().nullable().meta({
    description:
      'The median of the working days of the window the completed ones took, the first working day counted as day 1; null when none was completed.',
  }),
  onTimeRate: z.number().min(0).max(1).nullable().meta({
    description:
      'The share of those judged (completed, or open past the deadline) that were on time, from 0 to 1; null when none was judged. An operational figure, not a KPI.',
  }),
};

const rowSchema = z.strictObject({
  key: z.strictObject({
    id: z.uuid().nullable().meta({
      description:
        'The IT Admin or the department; null for the departures no task names an IT Admin for, or, grouped by department, of people who were never placed in one.',
    }),
    name: z.string().nullable().meta({ description: 'The full name of the IT Admin or the name of the department.' }),
  }),
  ...figures,
});

const reportSchema = z.strictObject({
  from: responseBusinessDate,
  to: responseBusinessDate,
  source: z.enum(['OFFBOARDING', 'TRANSFER']).nullable(),
  groupBy: z.enum(['itAdmin', 'department']),
  ...figures,
  rows: z.array(rowSchema).max(REPORT_PAGE_SIZE_MAX).meta({
    description:
      'One row for each IT Admin or department, the ones with the most overdue first; a page of them (`page`, `pageSize` of at most 100).',
  }),
  pagination: z.strictObject({
    page: z.number().int().positive(),
    pageSize: z.number().int().positive(),
    totalItems: z.number().int().nonnegative(),
    totalPages: z.number().int().nonnegative(),
  }),
  transferReRequests: z.strictObject({
    total: z.number().int().nonnegative().meta({
      description:
        'The requests sent from `from` to `to` by a person in the grace of their transfer for software they already hold (`limitExemption = TRANSFER_GRACE`).',
    }),
    provisionedWithinGrace: z.number().int().nonnegative().meta({
      description: 'Of those, the ones whose grant was completed by the last day of the grace of the transfer.',
    }),
  }),
});

export type RevocationSlaQuery = z.infer<typeof querySchema>;
export type RevocationSlaWire = z.infer<typeof reportSchema>;

export class RevocationSlaQueryDto extends createZodDto(querySchema) {}
export class RevocationSlaResponseDto extends createZodDto(successEnvelopeSchema(reportSchema)) {}
