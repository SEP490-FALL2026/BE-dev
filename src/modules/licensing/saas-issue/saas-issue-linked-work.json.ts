import { z } from 'zod';
import { nullableJsonColumn } from '../../../infrastructure/database/json-column';
import type { LinkedWork } from './saas-issue.policy';

/** The pointers to the work a report may lead to; each is only kept, none opens anything. */
const schema = z.object({
  grantTaskId: z.string().optional(),
  discrepancyId: z.string().optional(),
  returnId: z.string().optional(),
  requestId: z.string().optional(),
}) satisfies z.ZodType<LinkedWork>;

/** `saas_issues.linked_work`: NULL for a report that points at no work. */
export const linkedWorkJson = nullableJsonColumn({
  table: 'saas_issues',
  column: 'linked_work',
  schema,
  encode: (linked) => ({ ...linked }),
});
