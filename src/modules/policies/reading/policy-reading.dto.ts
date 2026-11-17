import { z } from 'zod';
import { successEnvelopeSchema } from '../../../infrastructure/http/dto/success-envelope.dto';
import { createZodDto } from '../../../infrastructure/http/dto/zod-dto';
import { policyContentSchema } from '../library/library.json';
import { POLICY_ROLES } from '../public/policies.types';

const instant = z.iso.datetime();
const roles = z.array(z.enum(POLICY_ROLES)).max(POLICY_ROLES.length);
const pagination = z.strictObject({
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  totalItems: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
});

export const policyPageQuerySchema = z.strictObject({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
});

export const policyDetailQuerySchema = z.strictObject({
  version: z.coerce
    .number()
    .int()
    .min(1)
    .optional()
    .meta({ description: 'A published version number; the version in force when omitted.' }),
});

export const policyStepParamSchema = z.strictObject({
  code: z
    .string()
    .trim()
    .regex(/^[A-Z0-9-]{3,30}$/, 'a policy code is capitals, digits and dashes'),
  stepCode: z.string().trim().min(1).max(30),
});

/** One policy of the library as a list shows it: the version in force and what the caller owes of it. */
export const policySummarySchema = z.strictObject({
  code: z.string(),
  title: z.string(),
  versionNumber: z.number().int().positive(),
  publishedAt: instant,
  requiresReacknowledgement: z.boolean(),
  applicableRoles: roles,
  hasDraft: z
    .boolean()
    .nullable()
    .meta({ description: 'Whether a draft is open; only the Super Admin is told, everyone else reads null.' }),
  myAcknowledgement: z.enum(['PENDING', 'DONE', 'NOT_REQUIRED']),
});

/** A version with its text. `myAcknowledgement` is the caller state for the version in force and null for an older one. */
export const policyDetailSchema = z.strictObject({
  id: z.uuid().meta({
    description: 'The id of the version: what a decision names when it answers the checklist of this version.',
  }),
  code: z.string(),
  title: z.string(),
  versionNumber: z.number().int().positive(),
  isCurrent: z.boolean(),
  publishedAt: instant,
  changeNote: z.string(),
  publishedByAppUserId: z
    .uuid()
    .nullable()
    .meta({ description: 'The account that published the version; null for a version the installation wrote.' }),
  requiresReacknowledgement: z.boolean(),
  applicableRoles: roles,
  content: policyContentSchema,
  myAcknowledgement: z.enum(['PENDING', 'DONE', 'NOT_REQUIRED']).nullable(),
});

export const policyVersionSummarySchema = z.strictObject({
  versionNumber: z.number().int().positive(),
  publishedAt: instant,
  changeNote: z.string(),
  publishedByAppUserId: z
    .uuid()
    .nullable()
    .meta({ description: 'The account that published the version; null for a version the installation wrote.' }),
  requiresReacknowledgement: z.boolean(),
  applicableRoles: roles,
});

export const policyStepSchema = z.strictObject({
  policyCode: z.string(),
  policyVersionId: z.uuid(),
  versionNumber: z.number().int().positive(),
  step: policyContentSchema.shape.steps.element,
});

export class PolicyPageQueryDto extends createZodDto(policyPageQuerySchema) {}
export class PolicyDetailQueryDto extends createZodDto(policyDetailQuerySchema) {}
export class PolicyStepParamDto extends createZodDto(policyStepParamSchema) {}
export class PolicyPageResponseDto extends createZodDto(
  successEnvelopeSchema(z.strictObject({ items: z.array(policySummarySchema), pagination })),
) {}
export class PolicyDetailResponseDto extends createZodDto(successEnvelopeSchema(policyDetailSchema)) {}
export class PolicyVersionPageResponseDto extends createZodDto(
  successEnvelopeSchema(z.strictObject({ items: z.array(policyVersionSummarySchema), pagination })),
) {}
export class PolicyStepResponseDto extends createZodDto(successEnvelopeSchema(policyStepSchema)) {}
