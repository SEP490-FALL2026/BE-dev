import { z } from 'zod';
import { nullableJsonColumn } from '../../../infrastructure/database/json-column';
import type { SeatImportResult } from './seat-baseline-import.types';

const count = z.number().int().nonnegative();

/** What the confirmation of a seat baseline file wrote, and the seats taken and free afterwards (null for an internal plan). */
const schema = z.object({
  created: count,
  errors: count,
  occupied: count.nullable(),
  free: z.number().int().nullable(),
}) satisfies z.ZodType<SeatImportResult>;

/** `seat_baseline_imports.result`: NULL until the import is confirmed. */
export const seatBaselineImportResultJson = nullableJsonColumn({
  table: 'seat_baseline_imports',
  column: 'result',
  schema,
  encode: (result) => result,
});
