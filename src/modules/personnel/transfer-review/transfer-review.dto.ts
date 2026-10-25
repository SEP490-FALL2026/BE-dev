import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { successEnvelopeSchema } from '../../../infrastructure/http/dto/success-envelope.dto';
import { isNoteAllowed, NEW_TOOL_NOTE_MAX } from './transfer-review.policy';

const idParamSchema = z.strictObject({ id: z.uuid() });

const flag = z.enum(['true', 'false']).transform((value) => value === 'true');

const STATUSES = ['OPEN', 'COMPLETED', 'SUPERSEDED'] as const;

const listQuerySchema = z.strictObject({
  status: z.enum(STATUSES).optional(),
  overdue: flag.optional(),
  departmentId: z.uuid().optional(),
  employeeId: z.uuid().optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});

const itemsQuerySchema = z.strictObject({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});

const decideBodySchema = z
  .strictObject({
    assignmentId: z.uuid(),
    decision: z.enum(['STILL_NEEDED', 'NOT_NEEDED', 'NEEDS_NEW_TOOL']),
    newToolNote: z.string().max(NEW_TOOL_NOTE_MAX).optional(),
  })
  .refine((body) => isNoteAllowed(body.decision, body.newToolNote), {
    message: 'A note goes only with the need for a new tool, and is not blank.',
    path: ['newToolNote'],
  });

const pagination = z.strictObject({
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  totalItems: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
});

const employeeBrief = z.strictObject({ id: z.uuid(), employeeCode: z.string(), fullName: z.string() });
const nameBrief = z.strictObject({ id: z.uuid(), name: z.string() });
const departmentBrief = z.strictObject({ id: z.uuid(), code: z.string(), name: z.string() });

/** The row of the list: who moved, where to, the deadline, how many tools still wait and whether anyone can decide yet. */
export const transferReviewSummarySchema = z.strictObject({
  id: z.uuid(),
  employee: employeeBrief,
  department: departmentBrief,
  jobTitle: nameBrief,
  effectiveOn: z.string(),
  dueOn: z.string(),
  status: z.enum(STATUSES),
  totalItems: z.number().int().nonnegative(),
  pendingItems: z.number().int().nonnegative(),
  /** Why nobody can decide yet: the department has no head today; null once it has one. */
  waitingReason: z.enum(['NO_HEAD']).nullable(),
  overdue: z.boolean(),
  /** Days past the deadline while the review is open and late; zero otherwise. */
  overdueDays: z.number().int().nonnegative(),
  /** Whether the caller is the head who decides now and the review is open. */
  canDecide: z.boolean(),
});

export const transferReviewDetailSchema = transferReviewSummarySchema.extend({
  /** The head of the department today, who decides; null while it has none. */
  reviewer: employeeBrief.nullable(),
  transferId: z.uuid().nullable(),
  openedAt: z.iso.datetime(),
  completedAt: z.iso.datetime().nullable(),
  /** When the reminder of a late review was written; null while none was. */
  overdueNoticedAt: z.iso.datetime().nullable(),
});

/** A tool outside the standard toolset with what was decided about it. */
export const transferReviewItemSchema = z.strictObject({
  assignmentId: z.uuid(),
  position: z.number().int().positive(),
  application: nameBrief,
  plan: nameBrief,
  provisioningType: z.enum(['K1', 'K2', 'K3', 'K4', 'K5']),
  /** Why the seat was given, as it was recorded; usage is not shown here. */
  grantReason: z.string().nullable(),
  decision: z.enum(['PENDING', 'STILL_NEEDED', 'NOT_NEEDED', 'NEEDS_NEW_TOOL']),
  decidedBy: employeeBrief.nullable(),
  decidedAt: z.iso.datetime().nullable(),
  newToolNote: z.string().nullable(),
  /** The revocation task a "no longer needed" decision opened. */
  revocationTaskId: z.uuid().nullable(),
});

const decisionResultSchema = z.strictObject({ review: transferReviewSummarySchema, item: transferReviewItemSchema });

export type TransferReviewSummaryWire = z.infer<typeof transferReviewSummarySchema>;
export type TransferReviewDetailWire = z.infer<typeof transferReviewDetailSchema>;
export type TransferReviewItemWire = z.infer<typeof transferReviewItemSchema>;
export type TransferReviewDecisionWire = z.infer<typeof decisionResultSchema>;

export class TransferReviewIdParamDto extends createZodDto(idParamSchema) {}
export class ListTransferReviewsQueryDto extends createZodDto(listQuerySchema) {}
export class ListTransferReviewItemsQueryDto extends createZodDto(itemsQuerySchema) {}
export class DecideTransferReviewBodyDto extends createZodDto(decideBodySchema) {}
export class TransferReviewDetailResponseDto extends createZodDto(successEnvelopeSchema(transferReviewDetailSchema)) {}
export class TransferReviewDecisionResponseDto extends createZodDto(successEnvelopeSchema(decisionResultSchema)) {}
export class TransferReviewPageResponseDto extends createZodDto(
  successEnvelopeSchema(z.strictObject({ items: z.array(transferReviewSummarySchema), pagination })),
) {}
export class TransferReviewItemPageResponseDto extends createZodDto(
  successEnvelopeSchema(z.strictObject({ items: z.array(transferReviewItemSchema), pagination })),
) {}
