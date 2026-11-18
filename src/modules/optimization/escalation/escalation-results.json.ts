import { z } from 'zod';
import { jsonColumn } from '../../../infrastructure/database/json-column';
import { ESCALATION_SKIP_REASONS, type EscalationItemResult } from './escalation.types';

/** What the batch answered for each recommendation it named, kept so the same key again gets the same answer. */
const schema = z
  .array(
    z.discriminatedUnion('outcome', [
      z.strictObject({
        recommendationId: z.uuid(),
        outcome: z.literal('ESCALATED'),
        state: z.enum(['AWAITING_DECISION', 'WAITING_FOR_HEAD']),
        departmentId: z.uuid(),
      }),
      z.strictObject({
        recommendationId: z.uuid(),
        outcome: z.literal('SKIPPED'),
        reason: z.enum(ESCALATION_SKIP_REASONS),
      }),
    ]),
  )
  .max(100);

/** `ghost_seat_escalations.results`. */
export const escalationResultsJson = jsonColumn({
  table: 'ghost_seat_escalations',
  column: 'results',
  schema,
  encode: (results: readonly EscalationItemResult[]) => [...results],
});
