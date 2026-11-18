import { z } from 'zod';
import { createZodDto } from '../../../infrastructure/http/dto/zod-dto';
import { successEnvelopeSchema } from '../../../infrastructure/http/dto/success-envelope.dto';

export const assessmentDecisionsQuerySchema = z.strictObject({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  departmentId: z.uuid().optional().meta({
    description:
      'Only the proposals of this department; a department outside the departments the caller reads gives an empty page.',
  }),
});

const personRef = z.strictObject({ employeeId: z.uuid(), employeeCode: z.string(), fullName: z.string() });

/**
 * One proposal whose assessment the IT Admin has decided: completed (sent on to the spend decision) or refused at the gate. What the Employee
 * declared and what the IT Admin wrote are in the assessment of the request.
 */
export const assessmentDecisionItemSchema = z.strictObject({
  requestId: z.uuid(),
  software: z.strictObject({ name: z.string() }),
  requester: personRef,
  department: z.strictObject({ id: z.uuid(), name: z.string() }),
  /** FULL is the software and its plan, PLAN_ONLY the plan alone (the proposal named an application of the catalog). */
  scope: z.enum(['FULL', 'PLAN_ONLY']),
  /** COMPLETED: the assessment was done and the request went on. REJECTED: the IT Admin refused it at the gate. */
  result: z.enum(['COMPLETED', 'REJECTED']),
  /** Why it was refused, when it was: the tool cannot be controlled, or the software is not eligible for the catalog; null when completed. */
  rejectionKind: z.enum(['UNCONTROLLABLE', 'NOT_ELIGIBLE']).nullable(),
  /** The reason the IT Admin gave for refusing; null when completed. */
  reason: z.string().nullable(),
  decidedBy: personRef,
  decidedAt: z.iso.datetime(),
});

const pagination = z.strictObject({
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  totalItems: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
});

export class AssessmentDecisionsQueryDto extends createZodDto(assessmentDecisionsQuerySchema) {}
export class AssessmentDecisionsResponseDto extends createZodDto(
  successEnvelopeSchema(z.strictObject({ items: z.array(assessmentDecisionItemSchema), pagination })),
) {}

export type AssessmentDecisionItemWire = z.infer<typeof assessmentDecisionItemSchema>;
