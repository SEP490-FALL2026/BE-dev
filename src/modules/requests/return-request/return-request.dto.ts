import { createZodDto } from '../../../infrastructure/http/dto/zod-dto';
import { z } from 'zod';
import { successEnvelopeSchema } from '../../../infrastructure/http/dto/success-envelope.dto';
import { REASON_MAX_LENGTH, employeeRef } from '../access-request/access-request.dto';

const planRef = z.strictObject({
  planId: z.uuid(),
  planName: z.string(),
  applicationId: z.uuid(),
  applicationName: z.string(),
});

/**
 * `BM-03` as the person sending it fills it (`US-01-12` AC-3): exactly one seat and the reason. Nothing else is accepted, so a
 * list of seats, two of them or none is refused as invalid and nothing is written. `fromRequestId` names the request whose
 * withdrawal was refused because its grant was done.
 */
export const returnSubmitSchema = z.strictObject({
  assignmentId: z.uuid(),
  reason: z.string().trim().min(1).max(REASON_MAX_LENGTH),
  fromRequestId: z.uuid().optional(),
});

export const returnListQuerySchema = z.strictObject({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  state: z.enum(['AWAITING_REVOCATION', 'COMPLETED', 'FAILED']).optional(),
  assignmentId: z.uuid().optional(),
});

export const returnIdParamSchema = z.strictObject({ id: z.uuid() });

/** One row of the list: who, which seat, where the revocation stands and what the handover asks; none of the long texts. */
export const returnSummarySchema = z.strictObject({
  id: z.uuid(),
  state: z.enum(['AWAITING_REVOCATION', 'COMPLETED', 'FAILED']),
  /** Who asked: the holder returning their seat, or the head of their department confirming it is no longer needed. */
  source: z.enum(['EMPLOYEE_RETURN', 'HEAD_CONFIRMATION']),
  assignmentId: z.uuid(),
  plan: planRef,
  holder: employeeRef,
  requestedBy: employeeRef,
  department: z.strictObject({ id: z.uuid(), code: z.string(), name: z.string() }),
  requestedOn: z.string(),
  /**
   * Since `QĐ-110g` no handover is asked of anyone: `required` is always false and `dueOn` null (also on a return an older release
   * wrote as required); `confirmed` and `flagged` are what was recorded then, as history. The key stays until the clients stop reading it.
   */
  handover: z.strictObject({
    required: z.boolean(),
    dueOn: z.string().nullable(),
    confirmed: z.boolean(),
    /** An older return: the revocation was completed after the deadline without the confirmation. */
    flagged: z.boolean(),
  }),
  createdAt: z.iso.datetime(),
  completedAt: z.iso.datetime().nullable(),
  failedAt: z.iso.datetime().nullable(),
});

export const returnDetailSchema = returnSummarySchema.extend({
  reason: z.string(),
  /** What the plan says to do before its right is taken away, as it was when the return was sent. */
  revocationNote: z.string().nullable(),
  /** The request whose withdrawal was refused because its grant was done; null for any other return. */
  originRequestId: z.uuid().nullable(),
  handoverConfirmedBy: employeeRef.nullable(),
  handoverConfirmedAt: z.iso.datetime().nullable(),
  /** Why the IT Admin closed the revocation as not done; null unless the return failed. */
  failureReason: z.string().nullable(),
});

const pagination = z.strictObject({
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  totalItems: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
});

export type ReturnSummaryWire = z.infer<typeof returnSummarySchema>;
export type ReturnDetailWire = z.infer<typeof returnDetailSchema>;

export class ReturnBodyDto extends createZodDto(returnSubmitSchema) {}
export class ReturnListQueryDto extends createZodDto(returnListQuerySchema) {}
export class ReturnIdParamDto extends createZodDto(returnIdParamSchema) {}
export class ReturnResponseDto extends createZodDto(
  successEnvelopeSchema(z.strictObject({ returnRequest: returnDetailSchema })),
) {}
export class ReturnListResponseDto extends createZodDto(
  successEnvelopeSchema(z.strictObject({ items: z.array(returnSummarySchema), pagination })),
) {}
