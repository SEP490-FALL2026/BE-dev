import { z } from 'zod';
import { createZodDto } from '../../../../infrastructure/http/dto/zod-dto';
import { page } from '../budget.dto';
import { HISTORY_CHANGES_MAX } from './version-history.policy';

/**
 * One edit of a version as Finance and the spending approver read it (F66, spec J.4): what kind of edit, which line or lines, the
 * fields it changed with their values before and after as text (an amount as a decimal in the currency of the version, a date as
 * `YYYY-MM-DD`), who and when. Never the role, the session, the correlation or the address of whoever did it, and nothing of the
 * Audit Trail. The lines of a line edit that adds or imports are shown as their range and their count; they are read in the lines.
 */
const historyChangeSchema = z.strictObject({
  field: z.string(),
  before: z.string().nullable(),
  after: z.string().nullable(),
});
const historyEntrySchema = z.strictObject({
  seq: z.number().int().positive(),
  kind: z.enum(['FIGURES_UPDATED', 'LINE_UPDATED', 'LINES_ADDED', 'LINES_IMPORTED', 'WINDOW_MOVED']),
  versionState: z.enum(['DRAFT', 'SENT', 'APPROVED', 'REJECTED', 'CHANGES_REQUESTED', 'SUPERSEDED', 'EXPIRED']),
  position: z.number().int().positive().nullable(),
  lines: z
    .strictObject({
      fromPosition: z.number().int().positive(),
      toPosition: z.number().int().positive(),
      count: z.number().int().positive(),
    })
    .nullable(),
  changes: z.array(historyChangeSchema).max(HISTORY_CHANGES_MAX),
  currency: z.string(),
  by: z.strictObject({ id: z.uuid(), name: z.string() }),
  at: z.iso.datetime(),
});

export class BudgetVersionHistoryPageResponseDto extends createZodDto(page(historyEntrySchema)) {}

export type HistoryEntryWire = z.infer<typeof historyEntrySchema>;
