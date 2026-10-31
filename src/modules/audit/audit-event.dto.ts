import { z } from 'zod';
import { successEnvelopeSchema } from '../../infrastructure/http/dto/success-envelope.dto';
import { createZodDto } from '../../infrastructure/http/dto/zod-dto';

const instant = z.iso.datetime({ offset: true });

/**
 * Strict: an unknown parameter (an `organizationId`, say) is refused rather than ignored, so a client
 * can never believe it narrowed or widened the trail in a way the server did not honour.
 */
export const listAuditEventsQuerySchema = z
  .strictObject({
    page: z.coerce.number().int().positive().default(1),
    pageSize: z.coerce.number().int().positive().max(100).default(20),
    resourceType: z.string().min(1).max(100).optional(),
    resourceId: z
      .string()
      .min(1)
      .max(200)
      .meta({ description: 'Needs resourceType: an id is only meaningful for one type of resource.' })
      .optional(),
    actorAppUserId: z.uuid().optional(),
    action: z.string().min(1).max(100).optional(),
    occurredFrom: instant
      .meta({
        description:
          'Must be earlier than occurredTo when both are given: the window includes occurredFrom and excludes occurredTo.',
      })
      .optional(),
    occurredTo: instant.optional(),
  })
  .superRefine((query, context) => {
    if (query.resourceId !== undefined && query.resourceType === undefined) {
      context.addIssue({ code: 'custom', path: ['resourceId'], message: 'resourceId requires resourceType.' });
    }
    if (
      query.occurredFrom !== undefined &&
      query.occurredTo !== undefined &&
      new Date(query.occurredFrom) >= new Date(query.occurredTo)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['occurredFrom'],
        message: 'occurredFrom must be earlier than occurredTo (the window is half-open).',
      });
    }
  });

const auditEventSchema = z.strictObject({
  id: z.uuid(),
  occurredAt: z.iso.datetime(),
  actorKind: z.enum(['USER', 'SYSTEM', 'OPERATOR']),
  actorAppUserId: z.uuid().nullable(),
  actorRoles: z.array(z.string()),
  action: z.string(),
  resourceType: z.string(),
  resourceId: z.string(),
  before: z.record(z.string(), z.unknown()).nullable(),
  after: z.record(z.string(), z.unknown()).nullable(),
  correlationId: z.string(),
  operatorReference: z.string().nullable(),
});

const auditEventPageSchema = z.strictObject({
  items: z.array(auditEventSchema),
  pagination: z.strictObject({
    page: z.number().int().positive(),
    pageSize: z.number().int().positive(),
    totalItems: z.number().int().nonnegative(),
    totalPages: z.number().int().nonnegative(),
  }),
});

export class ListAuditEventsQueryDto extends createZodDto(listAuditEventsQuerySchema) {}
export class AuditEventPageResponseDto extends createZodDto(successEnvelopeSchema(auditEventPageSchema)) {}
