import { z } from 'zod';
import { createZodDto } from '../../../infrastructure/http/dto/zod-dto';
import { successEnvelopeSchema } from '../../../infrastructure/http/dto/success-envelope.dto';

export const assessmentQueueQuerySchema = z.strictObject({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  departmentId: z.uuid().optional().meta({
    description:
      'Only the proposals of this department; a department outside the departments the caller reads gives an empty page, not an error.',
  }),
});

export const assessmentQueueDepartmentsQuerySchema = z.strictObject({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});

const personRef = z.strictObject({ employeeId: z.uuid(), employeeCode: z.string(), fullName: z.string() });

/**
 * One proposal that waits for the assessment of an IT Admin: what it is, who holds the step, how far the assessment has come and
 * whether a quote is recorded. What the Employee declared and what the IT Admin wrote are in the assessment of the request.
 */
export const assessmentQueueItemSchema = z.strictObject({
  requestId: z.uuid(),
  software: z.strictObject({ name: z.string(), expectedUsers: z.number().int().positive() }),
  requester: personRef,
  department: z.strictObject({ id: z.uuid(), name: z.string() }),
  /** Who holds the step: the caller, another IT Admin of the scope (who may be stood in for), or nobody (it waits for any IT Admin). */
  holder: z.enum(['YOU', 'ANOTHER_IT_ADMIN', 'NOBODY']),
  assignee: personRef.nullable(),
  /** Why nobody holds the step; null when somebody does. */
  waitingReason: z.string().nullable(),
  /** False when the caller asked for the request or is who it is for: the assessment is not theirs to fill. */
  canAct: z.boolean(),
  /** The IT Admin has saved the assessment at least once. */
  started: z.boolean(),
  classification: z.enum(['INTERNAL', 'PAID_LICENSED']).nullable(),
  /** What the IT Admin assesses: FULL is the software and its plan, PLAN_ONLY the plan alone (the proposal names an application of the catalog). */
  scope: z.enum(['FULL', 'PLAN_ONLY']),
  /**
   * What completing it would do now: it can be completed, it still lacks fields (`missingCount`), internal software is completed by
   * registering it, or a tool that cannot be controlled is refused at the gate instead.
   */
  readiness: z.enum(['COMPLETABLE', 'INCOMPLETE', 'INTERNAL_BY_REGISTRATION', 'UNCONTROLLABLE']),
  /** How many fields the assessment still lacks; 0 unless `readiness` is `INCOMPLETE`. */
  missingCount: z.number().int().nonnegative(),
  /** Whether the IT Admin has recorded a quote. The price of the request stays missing until the assessment is completed. */
  quote: z.enum(['MISSING', 'RECORDED']),
  slaWorkingDays: z.number().int().positive(),
  /** When the step came to the IT Admin: the head approved the need. */
  waitingSince: z.iso.datetime(),
});

const pagination = z.strictObject({
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  totalItems: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
});

/** How many proposals wait for IT assessment in one department of the scope of the caller. */
export const assessmentQueueDepartmentSchema = z.strictObject({
  department: z.strictObject({ id: z.uuid(), name: z.string() }),
  waiting: z.number().int().positive(),
});

export class AssessmentQueueQueryDto extends createZodDto(assessmentQueueQuerySchema) {}
export class AssessmentQueueDepartmentsQueryDto extends createZodDto(assessmentQueueDepartmentsQuerySchema) {}
export class AssessmentQueueDepartmentsResponseDto extends createZodDto(
  successEnvelopeSchema(z.strictObject({ items: z.array(assessmentQueueDepartmentSchema), pagination })),
) {}
export class AssessmentQueueResponseDto extends createZodDto(
  successEnvelopeSchema(z.strictObject({ items: z.array(assessmentQueueItemSchema), pagination })),
) {}

export type AssessmentQueueItemWire = z.infer<typeof assessmentQueueItemSchema>;
export type AssessmentQueueDepartmentWire = z.infer<typeof assessmentQueueDepartmentSchema>;
