import { z } from 'zod';
import { successEnvelopeSchema } from '../../../infrastructure/http/dto/success-envelope.dto';
import { createZodDto } from '../../../infrastructure/http/dto/zod-dto';

export const unplacedWorkKindSchema = z.enum(['PROVISIONING_TASK', 'OFFBOARDING_CASE', 'DEVICE_RETURN_TASK', 'DEVICE']);

const unplacedWorkTargetSchema = z.strictObject({
  workKind: unplacedWorkKindSchema,
  workId: z.uuid(),
});

export const appointUnplacedWorkDesignationBodySchema = z.strictObject({
  employeeId: z.uuid(),
  designeeEmployeeId: z.uuid(),
  reason: z.string().normalize('NFC').trim().min(1).max(500),
  works: z
    .array(unplacedWorkTargetSchema)
    .min(1)
    .max(50)
    .refine((works) => new Set(works.map((work) => `${work.workKind}:${work.workId}`)).size === works.length, {
      message: 'Each (workKind, workId) pair must appear at most once in works.',
    }),
});

export const unplacedWorkDesignationIdParamSchema = z.strictObject({ id: z.uuid() });

export const listUnplacedWorkDesignationsQuerySchema = z.strictObject({
  state: z.enum(['ACTIVE', 'ENDED', 'ALL']).default('ACTIVE'),
  workKind: unplacedWorkKindSchema.optional(),
  employeeId: z.uuid().optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});

const pagination = z.strictObject({
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  totalItems: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
});

const personBriefSchema = z.strictObject({
  id: z.uuid(),
  fullName: z.string(),
});

const unplacedWorkDesignationItemSchema = z.strictObject({
  id: z.uuid(),
  workKind: unplacedWorkKindSchema,
  workId: z.uuid(),
  employee: personBriefSchema,
  designee: personBriefSchema.extend({ usable: z.boolean() }),
  reason: z.string(),
  appointedAt: z.iso.datetime(),
  endedAt: z.iso.datetime().nullable(),
  endCause: z.enum(['REMOVED', 'WORK_CLOSED']).nullable(),
});

const appointUnplacedWorkDesignationResponseSchema = z.strictObject({
  items: z.array(unplacedWorkDesignationItemSchema),
});

const unplacedWorkDesignationPageSchema = z.strictObject({
  items: z.array(unplacedWorkDesignationItemSchema),
  pagination,
});

export class AppointUnplacedWorkDesignationBodyDto extends createZodDto(appointUnplacedWorkDesignationBodySchema) {}
export class UnplacedWorkDesignationIdParamDto extends createZodDto(unplacedWorkDesignationIdParamSchema) {}
export class ListUnplacedWorkDesignationsQueryDto extends createZodDto(listUnplacedWorkDesignationsQuerySchema) {}
export class AppointUnplacedWorkDesignationResponseDto extends createZodDto(
  successEnvelopeSchema(appointUnplacedWorkDesignationResponseSchema),
) {}
export class UnplacedWorkDesignationResponseDto extends createZodDto(
  successEnvelopeSchema(unplacedWorkDesignationItemSchema),
) {}
export class UnplacedWorkDesignationPageResponseDto extends createZodDto(
  successEnvelopeSchema(unplacedWorkDesignationPageSchema),
) {}
