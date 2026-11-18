import { z } from 'zod';
import { businessDate, responseBusinessDate } from '../../../infrastructure/http/dto/business-date.dto';
import { successEnvelopeSchema } from '../../../infrastructure/http/dto/success-envelope.dto';
import { createZodDto } from '../../../infrastructure/http/dto/zod-dto';
import {
  GHOST_SEAT_CLOSE_REASONS,
  GHOST_SEAT_GROUPS,
  GHOST_SEAT_STATES,
  GHOST_SEAT_TIERS,
} from '../ghost-seat/ghost-seat.types';

const group = z.enum(GHOST_SEAT_GROUPS);
const SKIP_GATES = [
  'PER_SEAT',
  'INTERNAL_SOFTWARE',
  'OPEN_RECOMMENDATION',
  'SERVICE_ACCOUNT',
  'LEAVE_OR_HANDOVER',
  'NOT_USABLE',
  'NEW_ASSIGNMENT',
  'COVERAGE',
  'STALE_SOURCE',
  'EXEMPT',
  'TIME_BOUND_ENDING',
  'REVOCATION_IN_PROGRESS',
  'NO_DATA',
  'UNMATCHED_IDENTITY',
  'INSUFFICIENT_EVIDENCE',
] as const;
const SEAT_STATUSES = [
  'ACTIVE',
  'INACTIVE',
  'NO_DATA',
  'UNMATCHED_IDENTITY',
  'INSUFFICIENT_EVIDENCE',
  'EXCLUDED',
] as const;
const pageQuery = {
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
};
const pagination = z.strictObject({
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  totalItems: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
});

export const recommendationIdParamSchema = z.strictObject({ id: z.uuid() });

export const recommendationListQuerySchema = z.strictObject({
  group: group.optional(),
  tier: z.enum(GHOST_SEAT_TIERS).optional(),
  state: z.enum(GHOST_SEAT_STATES).optional(),
  applicationId: z.uuid().optional(),
  departmentScope: z.enum(['MINE', 'ALL']).default('MINE').meta({
    description:
      'Kept for compatibility: both values read only the departments the IT Admin is in charge of, and those with no IT Admin; ALL no longer reads the whole organization.',
  }),
  departmentId: z.uuid().optional().meta({
    description:
      'Only the recommendations of this department: the department that owned the seat when it was recommended, not where the holder is placed now. A department outside the scope reads an empty page.',
  }),
  employeeId: z.uuid().optional().meta({ description: 'Only this holder; one outside the scope reads an empty page.' }),
  ...pageQuery,
});

export const seatStateListQuerySchema = z.strictObject({
  applicationId: z.uuid().optional(),
  status: z.enum(SEAT_STATUSES).optional(),
  departmentScope: z.enum(['MINE', 'ALL']).default('MINE').meta({
    description:
      'Kept for compatibility: both values read only the departments the IT Admin is in charge of, and those with no IT Admin; ALL no longer reads the whole organization.',
  }),
  departmentId: z.uuid().optional().meta({
    description:
      'Only the seats whose holder is placed in this department today, not the department of a recommendation. A department outside the scope reads an empty page.',
  }),
  employeeId: z.uuid().optional().meta({ description: 'Only this holder; one outside the scope reads an empty page.' }),
  ...pageQuery,
});

export const kpi5QuerySchema = z.strictObject({ from: businessDate, to: businessDate });

export const ruleRunListQuerySchema = z.strictObject(pageQuery);
export const ruleRunIdParamSchema = z.strictObject({ id: z.uuid() });
/** The sets of rules a run by hand runs; both when none is named. */
export const RULE_RUN_REQUEST_SETS = ['G1G2', 'G3G4'] as const;
export const ruleRunCreateBodySchema = z.strictObject({
  rules: z
    .array(z.enum(RULE_RUN_REQUEST_SETS))
    .min(1)
    .max(2)
    .optional()
    .meta({ description: 'G1G2 (internal data), G3G4 (usage) or both; both when left out.' }),
});

/** A row of the table of the IT Admin: what identifies it, what filters it and what can be done on it. */
const potentialSavingSchema = z.strictObject({
  monthlyAmountMinor: z
    .string()
    .nullable()
    .meta({ description: 'One month of the seat, in minor units of the currency; the only figure that adds up.' }),
  amountAtPointMinor: z.string().nullable().meta({
    description:
      'What is saved at the renewal or point of adjustment the seat can be had at; never added to what was avoided or really saved.',
  }),
  currency: z.string().nullable(),
  realisableOn: responseBusinessDate.nullable(),
  realisableAt: z.enum(['RENEWAL', 'ADJUSTMENT_POINT', 'NEXT_BILLING', 'UNKNOWN', 'NEVER']),
});

const recommendationSummarySchema = z.strictObject({
  id: z.uuid(),
  group,
  state: z.enum(GHOST_SEAT_STATES),
  closeReason: z.enum(GHOST_SEAT_CLOSE_REASONS).nullable(),
  tier: z.enum(GHOST_SEAT_TIERS).nullable(),
  confidenceLabel: z
    .enum(['INTERNAL_DATA'])
    .meta({ description: 'Data of the system itself: no level and no percentage.' }),
  application: z.strictObject({ applicationId: z.uuid(), applicationName: z.string() }),
  plan: z.strictObject({ planId: z.uuid(), planName: z.string() }),
  subscriptionId: z.uuid().nullable(),
  assignmentId: z.uuid().nullable(),
  holder: z.strictObject({ employeeId: z.uuid(), employeeCode: z.string() }).nullable(),
  freeSeats: z.number().int().nonnegative().nullable(),
  countsTowardVacantCost: z.boolean().nullable(),
  revocationTaskId: z.uuid().nullable(),
  labels: z.strictObject({
    revocationUnderWay: z.boolean().meta({ description: 'The reclaim of the seat is under way (a task holds it).' }),
    terminatingUntil: z
      .boolean()
      .meta({ description: 'A K1 access that runs on to a day: see `terminatingUntil` of the detail.' }),
    holderLeft: z.boolean().meta({ description: 'The holder of a seat a head decided on has left.' }),
  }),
  canReclaim: z.boolean(),
  confidence: z
    .enum(['HIGH', 'MEDIUM', 'LOW'])
    .nullable()
    .meta({ description: 'G3/G4 only: a level, never a percentage.' }),
  confidenceReasons: z.array(z.string()).max(8),
  activityStatus: z.enum(['NEVER_ACTIVE', 'INACTIVE']).nullable(),
  inactiveDays: z
    .number()
    .int()
    .nonnegative()
    .nullable()
    .meta({ description: 'Days covered by a source with no activity (not calendar days).' }),
  lastActiveDate: responseBusinessDate.nullable(),
  activityAfterDecisionOn: responseBusinessDate.nullable().meta({
    description: 'The first day of activity after a reclaim was decided: the IT Admin weighs giving the seat back.',
  }),
  usageLabels: z
    .array(z.string())
    .meta({ description: 'What the days rest on that is weaker than a vendor report (P-05), and LOW_CONFIDENCE.' }),
  potentialSaving: potentialSavingSchema.nullable(),
  createdAt: z.iso.datetime(),
});

const recommendationDetailSchema = recommendationSummarySchema.extend({
  evidence: z
    .record(z.string(), z.unknown())
    .meta({ description: 'What the recommendation was made from, by its group; written once.' }),
  holderLeftOn: responseBusinessDate.nullable(),
  terminatingUntil: responseBusinessDate.nullable(),
  closedAt: z.iso.datetime().nullable(),
  supersededById: z.uuid().nullable(),
  createdRunId: z.uuid(),
});

const summaryGroupSchema = z.strictObject({
  confidenceLabel: z.enum(['INTERNAL_DATA']),
  unclosedCount: z.number().int().nonnegative(),
  reclaimUnderWayCount: z.number().int().nonnegative(),
});

export const optimizationSummarySchema = z.strictObject({
  groups: z
    .strictObject({ G1: summaryGroupSchema, G2: summaryGroupSchema, G3: summaryGroupSchema, G4: summaryGroupSchema })
    .meta({ description: 'The four groups, each on its own.' }),
  counted: z
    .number()
    .int()
    .nonnegative()
    .meta({ description: 'The G2 not closed plus the G1 open: what the dashboard of the IT Admin counts.' }),
  limitation: z.string(),
  usage: z
    .strictObject({
      noSource: z.number().int().nonnegative(),
      stale: z.number().int().nonnegative(),
      insufficientEvidence: z.number().int().nonnegative(),
      unmatchedIdentities: z.number().int().nonnegative(),
      active: z.number().int().nonnegative(),
      inactive: z.number().int().nonnegative(),
      excluded: z.number().int().nonnegative(),
    })
    .meta({
      description: 'Seats by what the last weekly pass of G3/G4 found: none of the first four is read as inactive.',
    }),
});

const kpi5SliceSchema = z.strictObject({
  denominator: z.number().int().nonnegative(),
  numerator: z.number().int().nonnegative(),
  ratePercent: z.number().nullable(),
});

const kpi5GroupSchema = kpi5SliceSchema.extend({ confidenceLabel: z.enum(['INTERNAL_DATA']) });

export const kpi5Schema = kpi5SliceSchema.extend({
  from: responseBusinessDate,
  to: responseBusinessDate,
  byGroup: z.strictObject({ G1: kpi5GroupSchema, G2: kpi5GroupSchema, G3: kpi5GroupSchema, G4: kpi5GroupSchema }),
});

const skipSchema = z.strictObject({
  subjectType: z.enum(['SUBSCRIPTION', 'ASSIGNMENT']),
  subjectId: z.uuid(),
  gate: z.enum(SKIP_GATES),
  detail: z.strictObject({
    pricingModel: z.string().nullable().optional(),
    provisioningType: z.string().optional(),
    recommendationId: z.uuid().optional(),
    reason: z.string().optional(),
    coverageDays: z.number().int().nonnegative().optional(),
    requiredDays: z.number().int().nonnegative().optional(),
    until: z.string().optional(),
    sourceName: z.string().optional(),
  }),
});

/** One seat after the last weekly pass (FR-5.10): a seat with no data or an identity not matched has no days, and is never shown as inactive or as 0. */
const seatStateSchema = z.strictObject({
  seatChainId: z.uuid(),
  assignmentId: z.uuid(),
  application: z.strictObject({ applicationId: z.uuid(), applicationName: z.string() }),
  holder: z.strictObject({ employeeId: z.uuid(), employeeCode: z.string() }).nullable(),
  status: z.enum(SEAT_STATUSES),
  reason: z.enum(SKIP_GATES).nullable().meta({ description: 'The gate that left the seat out, when one did.' }),
  lastActiveDate: responseBusinessDate.nullable(),
  inactiveDays: z.number().int().nonnegative().nullable(),
  assessedOn: responseBusinessDate,
});

const ruleRunSchema = z.strictObject({
  id: z.uuid(),
  ruleSet: z.enum(['G1_G2', 'G3_G4']),
  periodKey: z.string(),
  status: z.enum(['RUNNING', 'COMPLETED', 'FAILED']),
  attempt: z.number().int().positive(),
  startedAt: z.iso.datetime(),
  finishedAt: z.iso.datetime().nullable(),
  createdCount: z.number().int().nonnegative(),
  updatedCount: z.number().int().nonnegative(),
  closedCount: z.number().int().nonnegative(),
  skippedCount: z.number().int().nonnegative(),
  failedCount: z.number().int().nonnegative(),
});

/** A run asked for by hand: the run as the list shows it, and how many subjects it left out by gate. */
const ruleRunResultSchema = ruleRunSchema.extend({
  skippedByGate: z
    .array(z.strictObject({ gate: z.enum(SKIP_GATES), count: z.number().int().positive() }))
    .meta({ description: 'How many subjects the run left out, by the gate that left each out.' }),
});

export class RecommendationIdParamDto extends createZodDto(recommendationIdParamSchema) {}
export class RecommendationListQueryDto extends createZodDto(recommendationListQuerySchema) {}
export class SeatStateListQueryDto extends createZodDto(seatStateListQuerySchema) {}
export class Kpi5QueryDto extends createZodDto(kpi5QuerySchema) {}
export class RuleRunIdParamDto extends createZodDto(ruleRunIdParamSchema) {}
export class RuleRunListQueryDto extends createZodDto(ruleRunListQuerySchema) {}
export class RuleRunCreateBodyDto extends createZodDto(ruleRunCreateBodySchema) {}
export class RecommendationPageResponseDto extends createZodDto(
  successEnvelopeSchema(z.strictObject({ items: z.array(recommendationSummarySchema), pagination })),
) {}
export class RecommendationResponseDto extends createZodDto(
  successEnvelopeSchema(z.strictObject({ recommendation: recommendationDetailSchema })),
) {}
export class ReclaimResponseDto extends createZodDto(
  successEnvelopeSchema(z.strictObject({ recommendation: recommendationDetailSchema, taskId: z.uuid() })),
) {}
export class OptimizationSummaryResponseDto extends createZodDto(successEnvelopeSchema(optimizationSummarySchema)) {}
export class Kpi5ResponseDto extends createZodDto(successEnvelopeSchema(kpi5Schema)) {}
export class RuleRunPageResponseDto extends createZodDto(
  successEnvelopeSchema(z.strictObject({ items: z.array(ruleRunSchema), pagination })),
) {}
export class RuleRunCreateResponseDto extends createZodDto(
  successEnvelopeSchema(z.strictObject({ runs: z.array(ruleRunResultSchema) })),
) {}
export class RuleSkipPageResponseDto extends createZodDto(
  successEnvelopeSchema(z.strictObject({ items: z.array(skipSchema), pagination })),
) {}
export class SeatStatePageResponseDto extends createZodDto(
  successEnvelopeSchema(z.strictObject({ items: z.array(seatStateSchema), pagination })),
) {}
