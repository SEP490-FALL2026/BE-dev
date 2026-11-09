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
