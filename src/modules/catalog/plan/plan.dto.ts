import { z } from 'zod';
import { isBusinessDate } from '../../../core/business-date';
import { successEnvelopeSchema } from '../../../infrastructure/http/dto/success-envelope.dto';
import { createZodDto } from '../../../infrastructure/http/dto/zod-dto';

/**
 * Only the shape and a generous bound are checked here. Whether a name is empty or too long, the kind fits the
 * application, the pricing model and the control level are present, or the note says what is lost is judged by the policy
 * and answers with its own `PLAN.*` code. The kind `K3` is accepted here on purpose: it is refused as a business rule.
 * A workspace profile has no field for a password: the object is strict.
 */
const text = z.string().max(1000);
const note = z.string().max(5000);
const provisioningType = z.enum(['K1', 'K2', 'K3', 'K4', 'K5']);
const pricingModel = z.enum(['PER_SEAT', 'FLAT_RATE', 'CONCURRENT', 'CONSUMPTION', 'PER_HOST']);
const controlLevel = z.enum(['FULL', 'PARTIAL', 'UNCONTROLLABLE']);
const sharingPolicy = z.enum(['ALLOWED', 'NOT_ALLOWED']);
const workspaceRole = z.enum(['OWNER', 'ADMIN']);
const businessDate = z.string().refine(isBusinessDate, { message: 'Must be a real date as YYYY-MM-DD.' });

export const declarePlanBodySchema = z.strictObject({
  applicationId: z.uuid(),
  name: text,
  provisioningType,
  pricingModel: pricingModel.optional(),
  controlLevel: controlLevel.optional(),
  revocationNote: note.nullable().optional(),
  dataLossOnRemoval: z.boolean().optional(),
  sharingPolicy: sharingPolicy.optional(),
});

/** The application cannot change: it is not a field here, so naming it is a validation error. */
export const updatePlanBodySchema = z.strictObject({
  name: text.optional(),
  provisioningType: provisioningType.optional(),
  pricingModel: pricingModel.nullable().optional(),
  controlLevel: controlLevel.nullable().optional(),
  revocationNote: note.nullable().optional(),
  dataLossOnRemoval: z.boolean().optional(),
  sharingPolicy: sharingPolicy.nullable().optional(),
});

export const workspaceProfileBodySchema = z.strictObject({
  primaryOwnerEmployeeId: z.uuid(),
  members: z
    .array(z.strictObject({ employeeId: z.uuid(), role: workspaceRole }))
    .min(1)
    .max(100),
  ownerLimit: z.number().int().min(1).max(1000).nullable().optional(),
  adminLimit: z.number().int().min(1).max(1000).nullable().optional(),
  ownerTransferProcedure: note.nullable().optional(),
  emergencyAccount: z
    .strictObject({
      identity: text,
      occupiesSeat: z.boolean(),
      holderEmployeeId: z.uuid(),
      lastReviewedOn: businessDate,
    })
    .nullable()
    .optional(),
});

export const listPlansQuerySchema = z.strictObject({
  applicationId: z.uuid().optional(),
  provisioningType: provisioningType.optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});
export const planIdParamSchema = z.strictObject({ id: z.uuid() });

const person = z.strictObject({ employeeId: z.uuid(), employeeCode: z.string(), fullName: z.string() });
const workspaceProfileSchema = z.strictObject({
  primaryOwner: person,
  members: z.array(person.extend({ role: workspaceRole })),
  ownerLimit: z.number().int().nullable(),
  adminLimit: z.number().int().nullable(),
  ownerTransferProcedure: z.string().nullable(),
  emergencyAccount: z
    .strictObject({
      identity: z.string(),
      occupiesSeat: z.boolean(),
      holder: person,
      lastReviewedOn: z.string(),
    })
    .nullable(),
  updatedAt: z.iso.datetime(),
});
/** A row of the list (`LD-05`); the plan as a detail or a write answers it is this and the revocation note. */
const planSummarySchema = z.strictObject({
  id: z.uuid(),
  applicationId: z.uuid(),
  applicationName: z.string(),
  name: z.string(),
  provisioningType,
  pricingModel: pricingModel.nullable(),
  controlLevel: controlLevel.nullable(),
  dataLossOnRemoval: z.boolean(),
  sharingPolicy: sharingPolicy.nullable(),
  seatTracking: z.enum(['APPLICABLE', 'NOT_APPLICABLE']),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
const planSchema = planSummarySchema.extend({ revocationNote: z.string().nullable() });
const planDetailSchema = planSchema.extend({ workspaceProfile: workspaceProfileSchema.nullable() });

export class DeclarePlanBodyDto extends createZodDto(declarePlanBodySchema) {}
export class UpdatePlanBodyDto extends createZodDto(updatePlanBodySchema) {}
export class WorkspaceProfileBodyDto extends createZodDto(workspaceProfileBodySchema) {}
export class ListPlansQueryDto extends createZodDto(listPlansQuerySchema) {}
export class PlanIdParamDto extends createZodDto(planIdParamSchema) {}
export class PlanResponseDto extends createZodDto(successEnvelopeSchema(planSchema)) {}
export class PlanDetailResponseDto extends createZodDto(successEnvelopeSchema(planDetailSchema)) {}
export class WorkspaceProfileResponseDto extends createZodDto(successEnvelopeSchema(workspaceProfileSchema)) {}
export class PlanPageResponseDto extends createZodDto(
  successEnvelopeSchema(
    z.strictObject({
      items: z.array(planSummarySchema),
      pagination: z.strictObject({
        page: z.number().int().positive(),
        pageSize: z.number().int().positive(),
        totalItems: z.number().int().nonnegative(),
        totalPages: z.number().int().nonnegative(),
      }),
    }),
  ),
) {}
