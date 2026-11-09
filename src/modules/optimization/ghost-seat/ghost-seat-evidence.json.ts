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
  terminatingAccess: z.strictObject({ until: day }).nullable(),
});

const optionalDay = day.nullable();

/** What a source said, as of the day the rule judged (`TC-3`): who it is, what it covers, how old it was, how strictly it reads activity. Never volume, a session or an event. */
const source = z.strictObject({
  sourceId: z.uuid().nullable(),
  name: z.string(),
  kind: z.enum(['VENDOR', 'COLLECTOR']),
  coverageFrom: optionalDay,
  coverageTo: optionalDay,
  ageDays: z.number().int().nonnegative().nullable(),
  activityDefinition: z.string().nullable(),
  strictness: z.enum(['STRICT', 'LOOSE']).nullable(),
});

/** The money a reclaim could save (`FR-4.15`, `R-J09`): the month, the amount at the point it can be had, and when that is (unknown until the points of adjustment exist). */
const potentialSaving = z.strictObject({
  monthlyAmountMinor: z.string().regex(/^\d+$/).nullable(),
  amountAtPointMinor: z.string().regex(/^\d+$/).nullable(),
  currency: z.string().length(3).nullable(),
  realisableOn: optionalDay,
  realisableAt: z.enum(['RENEWAL', 'ADJUSTMENT_POINT', 'NEXT_BILLING', 'UNKNOWN', 'NEVER']),
});

/**
 * `G3`/`G4` (`qd103-ghost-seat-g3-g4`, `TC-3`): what the weekly pass saw when it made the recommendation, written once and complete (a
 * `MONITOR` that is open is the only one rewritten, when it rises a tier): the sources as they were, how the person was tied, the days, the
 * thresholds and where they came from, the confidence and why, and the money.
 */
const usageGroup = z.strictObject({
  group: z.enum(['G3', 'G4']),
  employeeId: z.uuid(),
  planId: z.uuid(),
  sources: z.array(source),
  matchMethod: z.enum(['EXACT_EMAIL', 'ACCOUNT_IDENTIFIER', 'ALIAS_RULE', 'MANUAL']).nullable(),
  activityStatus: z.enum(['NEVER_ACTIVE', 'INACTIVE']),
  lastActiveDate: optionalDay,
  inactiveDays: z.number().int().nonnegative().nullable(),
  coverageDays: z.number().int().nonnegative(),
  thresholds: z.strictObject({
    values: z.strictObject({
      monitor: z.number().int().positive(),
      review: z.number().int().positive(),
      action: z.number().int().positive(),
    }),
    origin: z.enum(['APPLICATION', 'ORGANIZATION', 'DEFAULT']),
  }),
  confidence: z.strictObject({ level: z.enum(['HIGH', 'MEDIUM', 'LOW']), reasons: z.array(z.string()) }),
  labels: z.array(z.string()),
  timeBound: z.strictObject({ expectedEndDate: day }).nullable(),
  potentialSaving: potentialSaving.nullable(),
  previousDecision: z
    .strictObject({ recommendationId: z.uuid(), closeReason: z.enum(['KEPT', 'EXEMPTED']), closedOn: day })
    .nullable()
    .optional(),
});

/** What a recommendation was made from, by its group: written once and never changed (a trigger). */
const schema = z.discriminatedUnion('group', [g1, g2, usageGroup]);

export type GhostSeatEvidence = z.output<typeof schema>;
export type GhostSeatG1Evidence = z.output<typeof g1>;
export type GhostSeatG2Evidence = z.output<typeof g2>;
export type GhostSeatUsageEvidence = z.output<typeof usageGroup>;
export type GhostSeatPotentialSaving = z.output<typeof potentialSaving>;
export type GhostSeatEvidenceSource = z.output<typeof source>;

/** `ghost_seat_recommendations.evidence`. */
export const ghostSeatEvidenceJson = jsonColumn({
  table: 'ghost_seat_recommendations',
  column: 'evidence',
  schema,
  encode: (evidence) => evidence,
});
