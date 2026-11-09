import { z } from 'zod';
import { isValidTimeZone } from '../../../core/business-date';
import { successEnvelopeSchema } from '../../../infrastructure/http/dto/success-envelope.dto';
import { createZodDto } from '../../../infrastructure/http/dto/zod-dto';
import { sourceTemplateSchema } from './vendor-source-template.json';
import { IDENTIFIER_TYPES, MAX_DETECTABLE_GROUPS, REPORT_SHAPES } from './vendor-source.types';

const capabilitiesSchema = z.strictObject({
  memberList: z.boolean(),
  lastActivity: z.boolean(),
  eventDetail: z.boolean(),
  maxHistoryDays: z.number().int().min(1).max(3660).nullable().default(null),
});

const timeZone = z.string().trim().min(1).max(64).refine(isValidTimeZone, 'timeZone must be an IANA time zone');
const activityDefinition = z.string().trim().min(3).max(500);

export const usageSourceCreateBodySchema = z.strictObject({
  applicationId: z.uuid(),
  name: z.string().trim().min(1).max(120),
  identifierType: z.enum(IDENTIFIER_TYPES),
  reportShape: z.enum(REPORT_SHAPES),
  template: sourceTemplateSchema,
  timeZone,
  activityDefinition,
  definitionStrictness: z.enum(['STRICT', 'LOOSE']).default('STRICT'),
  evidenceDirection: z.enum(['POSITIVE_ONLY', 'POSITIVE_AND_NEGATIVE']).default('POSITIVE_ONLY'),
  capabilities: capabilitiesSchema,
});

export const usageSourceUpdateBodySchema = z
  .strictObject({
    name: usageSourceCreateBodySchema.shape.name,
    identifierType: usageSourceCreateBodySchema.shape.identifierType,
    reportShape: usageSourceCreateBodySchema.shape.reportShape,
    template: sourceTemplateSchema,
    timeZone,
    activityDefinition,
    definitionStrictness: z.enum(['STRICT', 'LOOSE']),
    evidenceDirection: z.enum(['POSITIVE_ONLY', 'POSITIVE_AND_NEGATIVE']),
    capabilities: capabilitiesSchema,
  })
  .partial()
  .refine((body) => Object.keys(body).length > 0, 'at least one field must change');

export const usageSourceIdParamSchema = z.strictObject({ id: z.uuid() });
export const usageSourceListQuerySchema = z.strictObject({
  applicationId: z.uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

const sourceSchema = z.strictObject({
  id: z.uuid(),
  application: z.strictObject({ id: z.uuid(), name: z.string() }),
  name: z.string(),
  identifierType: z.enum(IDENTIFIER_TYPES),
  reportShape: z.enum(REPORT_SHAPES),
  template: sourceTemplateSchema,
  timeZone: z.string(),
  activityDefinition: z.string(),
  definitionStrictness: z.enum(['STRICT', 'LOOSE']),
  evidenceDirection: z.enum(['POSITIVE_ONLY', 'POSITIVE_AND_NEGATIVE']),
  capabilities: capabilitiesSchema,
  detectableGroups: z.array(z.enum(['G1', 'G2', 'G3', 'G4'])).max(MAX_DETECTABLE_GROUPS),
  limitation: z.string().nullable(),
  canConcludeAbsence: z.boolean(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

/** A source in a list: without its template, which only the source itself shows. */
const sourceItemSchema = sourceSchema.omit({ template: true });

export class UsageSourceCreateBodyDto extends createZodDto(usageSourceCreateBodySchema) {}
export class UsageSourceUpdateBodyDto extends createZodDto(usageSourceUpdateBodySchema) {}
export class UsageSourceIdParamDto extends createZodDto(usageSourceIdParamSchema) {}
export class UsageSourceListQueryDto extends createZodDto(usageSourceListQuerySchema) {}
export class UsageSourceResponseDto extends createZodDto(successEnvelopeSchema(sourceSchema)) {}
export class UsageSourcePageResponseDto extends createZodDto(
  successEnvelopeSchema(
    z.strictObject({
      items: z.array(sourceItemSchema),
      pagination: z.strictObject({
        page: z.number().int().positive(),
        pageSize: z.number().int().positive(),
        totalItems: z.number().int().nonnegative(),
        totalPages: z.number().int().nonnegative(),
      }),
    }),
  ),
) {}
