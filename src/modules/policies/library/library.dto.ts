import { z } from 'zod';
import { successEnvelopeSchema } from '../../../infrastructure/http/dto/success-envelope.dto';
import { createZodDto } from '../../../infrastructure/http/dto/zod-dto';
import { POLICY_ROLES } from '../public/policies.types';
import { policyContentSchema } from './library.json';

const text = (max: number) => z.string().trim().min(1).max(max);

/** The codes of the library are `POL-…`: a short word with capitals, digits and a dash. */
export const policyCodeParamSchema = z.strictObject({
  code: z
    .string()
    .trim()
    .regex(/^[A-Z0-9-]{3,30}$/, 'a policy code is capitals, digits and dashes'),
});

const roleSchema = z.enum(POLICY_ROLES);

/** What a write to the draft may give: either field alone, both, or nothing (which opens the draft as a copy of the version in force). */
export const draftWriteBodySchema = z.strictObject({
  title: text(300).optional(),
  content: policyContentSchema.optional(),
});

export const publishBodySchema = z.strictObject({
  changeNote: text(1000).meta({
    description: 'The ground of the issue: the decision, its number and date, who issued it. Kept with the version.',
  }),
  applicableRoles: z
    .array(roleSchema)
    .min(1)
    .max(POLICY_ROLES.length)
    .refine((roles) => new Set(roles).size === roles.length, 'a role is named once')
    .meta({ description: 'The roles that must acknowledge the version; a person of none of them is never asked.' }),
  requiresReacknowledgement: z.boolean().default(true).meta({
    description: 'Whether those who acknowledged an earlier version are asked again. The first version always asks.',
  }),
});

const instant = z.iso.datetime();

/** A draft as the Super Admin reads it: the text of the version being written and the roles it would apply to. */
export const policyDraftSchema = z.strictObject({
  policyCode: z.string(),
  title: z.string(),
  content: policyContentSchema,
  applicableRoles: z.array(roleSchema).max(POLICY_ROLES.length),
  updatedAt: instant,
});

export const publishedPolicyVersionSchema = z.strictObject({
  policyCode: z.string(),
  versionNumber: z.number().int().positive(),
  publishedAt: instant,
  requiresReacknowledgement: z.boolean(),
  applicableRoles: z.array(roleSchema).max(POLICY_ROLES.length),
  notified: z.number().int().nonnegative(),
});

export class PolicyCodeParamDto extends createZodDto(policyCodeParamSchema) {}
export class DraftWriteBodyDto extends createZodDto(draftWriteBodySchema) {}
export class PublishBodyDto extends createZodDto(publishBodySchema) {}
export class PolicyDraftResponseDto extends createZodDto(successEnvelopeSchema(policyDraftSchema)) {}
export class PolicyPublishedResponseDto extends createZodDto(successEnvelopeSchema(publishedPolicyVersionSchema)) {}
export class PolicyDraftDiscardedResponseDto extends createZodDto(
  successEnvelopeSchema(z.strictObject({ policyCode: z.string(), discarded: z.literal(true) })),
) {}
