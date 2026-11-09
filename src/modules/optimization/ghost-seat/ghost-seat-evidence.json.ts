import { z } from 'zod';
import { jsonColumn } from '../../../infrastructure/database/json-column';

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** `G1`: the seats bought, taken and free on the day the rule looked (`US-10-01` AC-1), and what to do with them. */
const g1 = z.strictObject({
  group: z.literal('G1'),
  purchased: z.number().int().nonnegative(),
  occupied: z.number().int().nonnegative(),
  free: z.number().int().nonnegative(),
  asOf: day,
  action: z.enum(['REGRANT_OR_REDUCE', 'REGRANT_BEFORE_PURCHASE']),
});

/** `G2`: the person who left and still holds the seat; `terminatingAccess` is the day a K1 access ends (`QĐ-77l`). */
const g2 = z.strictObject({
  group: z.literal('G2'),
  employeeId: z.uuid(),
  leftOn: day.nullable(),
  planId: z.uuid(),
  provisioningType: z.enum(['K1', 'K2', 'K3', 'K4', 'K5']),
  terminatingAccess: z.strictObject({ until: day }).optional(),
});

/** What a recommendation was made from, by its group: written once and never changed (a trigger). */
const schema = z.discriminatedUnion('group', [g1, g2]);

export type GhostSeatEvidence = z.output<typeof schema>;
export type GhostSeatG1Evidence = z.output<typeof g1>;
export type GhostSeatG2Evidence = z.output<typeof g2>;

/** `ghost_seat_recommendations.evidence`. */
export const ghostSeatEvidenceJson = jsonColumn({
  table: 'ghost_seat_recommendations',
  column: 'evidence',
  schema,
  encode: (evidence) => evidence,
});
