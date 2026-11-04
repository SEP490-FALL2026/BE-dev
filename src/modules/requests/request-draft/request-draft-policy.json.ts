import { z } from 'zod';
import { jsonColumn } from '../../../infrastructure/database/json-column';

/**
 * What a draft keeps in the `policy` column of `access_requests` while it is a draft: `{ draft: { kind, ...body } }`, the body of the
 * operation that sends that kind of request exactly as it was validated when the draft was saved. The column has two shapes over the
 * life of a row: this one while the row is a draft, and `RequestPolicy` (`access-request.json.ts`) once it is sent. What is in the
 * body is judged when the draft is sent, by the schema of that operation (`request-draft-content.mapper.ts`), so here it is only an
 * object of JSON values with its `kind`.
 */
const schema = z.object({ draft: z.object({ kind: z.string() }).catchall(z.json()) });

/** Keys saved by older versions and ignored when an old draft is sent (QD-93h phase 1). */
export const RETIRED_DRAFT_BODY_KEYS = ['projectLabel'] as const;

/** The `policy` of a row that is a draft. */
export type DraftPolicy = z.output<typeof schema>;

/** `access_requests.policy` of a row in the state `DRAFT`. Never read through this for a request that has been sent. */
export const draftPolicyJson = jsonColumn({
  table: 'access_requests',
  column: 'policy',
  schema,
  encode: (policy) => policy,
});
