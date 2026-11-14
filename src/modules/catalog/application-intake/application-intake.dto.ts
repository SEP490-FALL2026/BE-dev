import { z } from 'zod';
import { successEnvelopeSchema } from '../../../infrastructure/http/dto/success-envelope.dto';
import { createZodDto } from '../../../infrastructure/http/dto/zod-dto';
import { applicationSchema, sensitivity, text, textList } from '../catalog-entry/application.dto';
import { declarePlanBodySchema, planSchema } from '../plan/plan.dto';

/**
 * The first plan of a new application. It is the plan body of `POST /plans` without the application (it is the one being made) and without the
 * pricing model (the system works it out from the kind of provisioning, `B-5`): whether the kind fits, a control level is named or the note says
 * what is lost is judged by the plan rules and answers with their `PLAN.*` code, and whatever they refuse undoes the application too.
 */
const firstPlanSchema = declarePlanBodySchema.omit({ applicationId: true, pricingModel: true });

/**
 * One command for a new entry of the catalog (`QĐ-111f`): the application and its first plan. There is no field for the kind of the application
 * (it follows the kind of provisioning, `QĐ-111d`) or for the answers about communication (the group says it, `QĐ-111e`); the object is strict,
 * so naming one is a validation error. Only the shape is checked here.
 */
export const createApplicationBodySchema = z.strictObject({
  name: text,
  vendorName: text.optional(),
  dictionaryServiceLineId: z.uuid().optional(),
  homepageUrl: text.optional().meta({
    description:
      'The web page of the software: its host is kept among the domains, and a catalog entry that has it already is a duplicate.',
  }),
  domains: textList.optional(),
  functionalGroupId: z
    .uuid()
    .optional()
    .meta({ description: 'The group the application is classed under; left out, it stands in Khác.' }),
  dataSensitivity: sensitivity.nullable().optional(),
  plan: firstPlanSchema,
});

const createdApplicationSchema = applicationSchema.extend({
  proposedToDictionary: z.boolean(),
  plan: planSchema,
});

export class CreateApplicationBodyDto extends createZodDto(createApplicationBodySchema) {}
export class CreatedApplicationResponseDto extends createZodDto(successEnvelopeSchema(createdApplicationSchema)) {}
