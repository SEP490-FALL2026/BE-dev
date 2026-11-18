import { z } from 'zod';
import { jsonColumn, nullableJsonColumn } from '../../../infrastructure/database/json-column';

/**
 * The fields an edit of a budget version changed, before and after, as text (`version-history.policy.ts`): an object of JSON values,
 * or for the lines an entry adds, a list of such objects. Free-form on purpose, so the keys are not listed here.
 */
const fields = z.record(z.string(), z.json());
const afterSchema = z.union([fields, z.array(z.json())]);

/** What an entry of the history keeps of the version before the edit; null for an entry that adds lines. */
export type HistoryBefore = z.output<typeof fields> | null;
/** What it keeps after the edit: the fields, or the lines that were added. */
export type HistoryAfter = z.output<typeof afterSchema>;

/** `budget_version_history.before`: NULL for an entry that adds lines. */
export const historyBeforeJson = nullableJsonColumn({
  table: 'budget_version_history',
  column: 'before',
  schema: fields,
  encode: (before) => before,
});

/** `budget_version_history.after`: the fields after the edit, or the lines it added. */
export const historyAfterJson = jsonColumn({
  table: 'budget_version_history',
  column: 'after',
  schema: afterSchema,
  encode: (after) => after,
});
