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
  departmentScope: z.enum(['MINE', 'ALL']).default('ALL'),
  ...pageQuery,
});

export const kpi5QuerySchema = z.strictObject({ from: businessDate, to: businessDate });

export const ruleRunListQuerySchema = z.strictObject(pageQuery);
export const ruleRunIdParamSchema = z.strictObject({ id: z.uuid() });

/** A row of the table of the IT Admin: what identifies it, what filters it and what can be done on it. */
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
  holder: z.strictObject({ employeeId: z.uuid(), employeeCode: z.string(), fullName: z.string() }).nullable(),
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
  gate: z.enum(['PER_SEAT', 'INTERNAL_SOFTWARE', 'OPEN_RECOMMENDATION']),
  detail: z.strictObject({
    pricingModel: z.string().nullable().optional(),
    provisioningType: z.string().optional(),
    recommendationId: z.uuid().optional(),
  }),
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

export class RecommendationIdParamDto extends createZodDto(recommendationIdParamSchema) {}
export class RecommendationListQueryDto extends createZodDto(recommendationListQuerySchema) {}
export class Kpi5QueryDto extends createZodDto(kpi5QuerySchema) {}
export class RuleRunIdParamDto extends createZodDto(ruleRunIdParamSchema) {}
export class RuleRunListQueryDto extends createZodDto(ruleRunListQuerySchema) {}
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
export class RuleSkipPageResponseDto extends createZodDto(
  successEnvelopeSchema(z.strictObject({ items: z.array(skipSchema), pagination })),
) {}
