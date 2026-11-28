import { z } from 'zod';
import { successEnvelopeSchema } from '../../../infrastructure/http/dto/success-envelope.dto';
import { createZodDto } from '../../../infrastructure/http/dto/zod-dto';
import { businessDate } from '../../../infrastructure/http/dto/business-date.dto';

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
const keyBinding = z.enum(['ACCOUNT', 'DEVICE_KEY', 'DEVICE_BUNDLED']).meta({
  description:
    'How a K4 plan is bound once bought: ACCOUNT (a seat of a person, the default of a K4 plan), DEVICE_KEY (a key that goes on a machine) or DEVICE_BUNDLED (comes with the machine: no key, no price, no console). A plan of another kind has none.',
});
const workspaceRole = z.enum(['OWNER', 'ADMIN']);
/** The reference price of a plan (`QĐ-113a`): money as text (ADR-0007), in dong; another currency is refused (PLAN.REFERENCE_PRICE_NOT_VND). */
const referencePrice = z.strictObject({ amount: z.string().max(40), currency: z.string().regex(/^[A-Z]{3}$/) }).meta({
  description:
    'The price before tax in dong, a decimal string in major units, currency VND: K1/K2, one seat for one month (a yearly price over 12); K4, price of one license. Used by a request when no subscription of the plan has a price. K5 has none.',
});
const referenceCommitmentMonths = z.union([z.literal(1), z.literal(12)]).meta({
  description:
    'Default commitment term in months (1 or 12) for K1/K2 plans when creating a term subscription without specifying commitmentTermMonths.',
});

export const declarePlanBodySchema = z.strictObject({
  applicationId: z.uuid(),
  name: text,
  provisioningType,
  keyBinding: keyBinding.optional(),
  pricingModel: pricingModel.optional(),
  controlLevel: controlLevel.optional(),
  revocationNote: note.nullable().optional(),
  dataLossOnRemoval: z.boolean().optional(),
  sharingPolicy: sharingPolicy.optional(),
  hasAdminConsole: z.boolean().optional(),
  referencePrice: referencePrice.optional(),
  referenceCommitmentMonths: referenceCommitmentMonths.optional(),
});

/** The application cannot change: it is not a field here, so naming it is a validation error. */
export const updatePlanBodySchema = z.strictObject({
  name: text.optional(),
  provisioningType: provisioningType.optional(),
  keyBinding: keyBinding.optional(),
  pricingModel: pricingModel.nullable().optional(),
  controlLevel: controlLevel.nullable().optional(),
  revocationNote: note.nullable().optional(),
  dataLossOnRemoval: z.boolean().optional(),
  sharingPolicy: sharingPolicy.nullable().optional(),
  hasAdminConsole: z.boolean().optional(),
  referencePrice: referencePrice.nullable().optional().meta({
    description: 'The reference price; null clears it. Moving the plan to K5, or between K1/K2 and K4, clears it too.',
  }),
  referenceCommitmentMonths: referenceCommitmentMonths.nullable().optional().meta({
    description: 'Default commitment term in months (1 or 12) for K1/K2 plans; null clears it.',
  }),
});

export const workspaceProfileBodySchema = z.strictObject({
  primaryOwnerEmployeeId: z.uuid(),
  members: z
    .array(z.strictObject({ employeeId: z.uuid(), role: workspaceRole }))
    .min(1)
    .max(20),
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
  /** The email of the company account that stands as owner at the vendor (`QĐ-110u`): never a password. Missing means the subscription is flagged, not refused. */
  ownerAccountEmail: z.string().trim().min(1).max(320).pipe(z.email()).nullable().optional(),
  adminNote: z.string().max(2000).nullable().optional(),
});

export const listPlansQuerySchema = z.strictObject({
  applicationId: z.uuid().optional(),
  provisioningType: provisioningType.optional(),
  keyBinding: keyBinding.optional().meta({ description: 'Only the plans bound this way (K4 plans).' }),
  functionalGroupId: z
    .uuid()
    .optional()
    .meta({ description: 'Only the plans of the applications in this functional group.' }),
  status: z
    .enum(['APPROVED', 'RETIRED'])
    .optional()
    .meta({ description: 'Only the plans of the applications in this catalog status.' }),
  search: z
    .string()
    .max(100)
    .optional()
    .meta({ description: 'Text in the name of the plan or of its application, ignoring case and accents.' }),
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
  ownerAccountEmail: z.string().nullable(),
  adminNote: z.string().nullable(),
  updatedAt: z.iso.datetime(),
});
/** A row of the list; the plan as a detail or a write answers it is this and the revocation note. */
const planSummarySchema = z.strictObject({
  id: z.uuid(),
  applicationId: z.uuid(),
  applicationName: z.string(),
  applicationLogoUrl: z.string().nullable().meta({
    description:
      'The https link to the logo image of the application, or null. It may be broken: show the first letter of the application name when the image does not load.',
  }),
  name: z.string(),
  provisioningType,
  keyBinding: keyBinding.nullable(),
  pricingModel: pricingModel.nullable(),
  controlLevel: controlLevel.nullable(),
  dataLossOnRemoval: z.boolean(),
  sharingPolicy: sharingPolicy.nullable(),
  /** A `K4` plan the company administers through a console of the vendor needs two IT Admins there (`R-53`); false for every other kind. */
  hasAdminConsole: z.boolean(),
  referencePrice: z
    .strictObject({ amount: z.string(), currency: z.string() })
    .nullable()
    .meta({ description: 'The reference price in dong before tax, or null when none is entered.' }),
  referenceCommitmentMonths: z.union([z.literal(1), z.literal(12)]).nullable(),
  seatTracking: z.enum(['APPLICABLE', 'NOT_APPLICABLE']),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export const planSchema = planSummarySchema.extend({ revocationNote: z.string().nullable() });
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
