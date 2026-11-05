import { z } from 'zod';
import { successEnvelopeSchema } from '../../../infrastructure/http/dto/success-envelope.dto';
import { createZodDto } from '../../../infrastructure/http/dto/zod-dto';
import { AI_TOOL_KEYS } from './allowlist.policy';

export const aiToolKeySchema = z.enum(AI_TOOL_KEYS);

const aiToolMapping = z.strictObject({
  tool: aiToolKeySchema,
  applicationId: z.uuid(),
});

export const allowlistVersionBodySchema = z.strictObject({
  reason: z.string().trim().min(1).max(1000),
  aiTools: z
    .array(aiToolMapping)
    .max(3)
    .refine((items) => new Set(items.map((item) => item.tool)).size === items.length, 'tool must not repeat')
    .refine(
      (items) => new Set(items.map((item) => item.applicationId)).size === items.length,
      'applicationId must not repeat',
    )
    .meta({
      description:
        'The AI tools a collector may report, each with the application it stands for in the catalog; empty removes them all. A tool or an application may appear once.',
      uniqueItems: true,
    }),
});

export const allowlistListQuerySchema = z.strictObject({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

const application = z.strictObject({ id: z.uuid(), name: z.string() });
const entry = z.strictObject({
  kind: z.enum(['AI_TOOL']),
  key: aiToolKeySchema,
  application,
  experimental: z.boolean(),
});

export const allowlistVersionSchema = z.strictObject({
  id: z.uuid(),
  versionNumber: z.number().int().positive(),
  publishedAt: z.iso.datetime(),
  entries: z.array(entry).max(3),
});

const entryRowSchema = entry.extend({ versionNumber: z.number().int().positive(), publishedAt: z.iso.datetime() });

export class AllowlistVersionBodyDto extends createZodDto(allowlistVersionBodySchema) {}
export class AllowlistListQueryDto extends createZodDto(allowlistListQuerySchema) {}
export class AllowlistVersionResponseDto extends createZodDto(successEnvelopeSchema(allowlistVersionSchema)) {}
export class AllowlistEntryPageResponseDto extends createZodDto(
  successEnvelopeSchema(
    z.strictObject({
      items: z.array(entryRowSchema),
      pagination: z.strictObject({
        page: z.number().int().positive(),
        pageSize: z.number().int().positive(),
        totalItems: z.number().int().nonnegative(),
        totalPages: z.number().int().nonnegative(),
      }),
    }),
  ),
) {}
