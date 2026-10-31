import { z } from 'zod';
import { isBusinessDate } from '../../../core/business-date';
import { jsonColumn } from '../../../infrastructure/database/json-column';
import type { SeatImportSummary } from './seat-baseline-import.types';

const count = z.number().int().nonnegative();

/** What the preview of a seat baseline file said about the file as a whole, and the subscription or plan it is for. */
const schema = z.object({
  target: z.object({
    kind: z.enum(['SUBSCRIPTION', 'PLAN']),
    subscriptionId: z.string().nullable(),
    planId: z.string(),
    planName: z.string(),
    applicationName: z.string(),
    provisioningType: z.string(),
  }),
  totalRows: count,
  valid: count,
  errors: count,
  byCode: z.record(z.string(), count),
  seats: z
    .object({ purchased: count, occupiedBefore: count, freeBefore: z.number().int(), freeAfter: z.number().int() })
    .nullable(),
  recordedOn: z.string().refine(isBusinessDate),
}) satisfies z.ZodType<SeatImportSummary>;

/** `seat_baseline_imports.summary`. */
export const seatBaselineImportSummaryJson = jsonColumn({
  table: 'seat_baseline_imports',
  column: 'summary',
  schema,
  encode: (summary) => summary,
});
