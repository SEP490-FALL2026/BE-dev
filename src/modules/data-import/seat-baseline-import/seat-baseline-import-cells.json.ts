import { z } from 'zod';
import { jsonColumn } from '../../../infrastructure/database/json-column';
import { SEAT_COLUMNS, type SeatCells } from './seat-baseline-import.types';

/** What one row of a seat baseline file said, by column, as it was read; an identifier that looks like a secret was masked before. */
const schema = z.partialRecord(z.enum(SEAT_COLUMNS), z.string()) satisfies z.ZodType<SeatCells>;

/** `seat_baseline_import_rows.cells`. */
export const seatBaselineImportCellsJson = jsonColumn({
  table: 'seat_baseline_import_rows',
  column: 'cells',
  schema,
  encode: (cells) => cells,
});
