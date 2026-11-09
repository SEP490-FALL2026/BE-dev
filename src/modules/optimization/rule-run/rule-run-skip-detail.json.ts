import { z } from 'zod';
import { jsonColumn } from '../../../infrastructure/database/json-column';

/** What a run kept of why it left a subject out: the plan facts that decided it, or the recommendation already open (gate 8). */
const schema = z.strictObject({
  pricingModel: z.string().nullable().optional(),
  provisioningType: z.string().optional(),
  recommendationId: z.uuid().optional(),
});

export type RuleSkipDetail = z.output<typeof schema>;

/** `ghost_seat_rule_skips.detail`. */
export const ruleSkipDetailJson = jsonColumn({
  table: 'ghost_seat_rule_skips',
  column: 'detail',
  schema,
  encode: (detail) => detail,
});
