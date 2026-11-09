import { z } from 'zod';
import { nullableJsonColumn } from '../../../infrastructure/database/json-column';

/** What kind of purchase a line of `BM-10` is (`QĐ-101n`). */
export type LineType = 'RENEW' | 'CHANGE' | 'NEW' | 'CANCEL';

export const LINE_TYPES = ['RENEW', 'CHANGE', 'NEW', 'CANCEL'] as const satisfies readonly LineType[];

/** The reduced zero-based-budget explanation of a line (`QĐ-94l`): four short answers. */
export interface ZbbExplanation {
  purpose: string;
  alternatives: string;
  consequenceIfNot: string;
  usageIndicator: string;
}

/** The four short answers of the reduced zero-based-budget explanation, as they are stored (`QĐ-94l`). */
const zbbSchema = z.strictObject({
  purpose: z.string(),
  alternatives: z.string(),
  consequenceIfNot: z.string(),
  usageIndicator: z.string(),
});

const encode = (zbb: ZbbExplanation) => ({ ...zbb });

/** `budget_proposal_lines.zbb`: NULL when the line gave no explanation. */
export const proposalLineZbbJson = nullableJsonColumn({
  table: 'budget_proposal_lines',
  column: 'zbb',
  schema: zbbSchema,
  encode,
});

/** `budget_version_lines.zbb`: copied from the line of the proposal, or given by Finance; NULL when there is none. */
export const versionLineZbbJson = nullableJsonColumn({
  table: 'budget_version_lines',
  column: 'zbb',
  schema: zbbSchema,
  encode,
});
