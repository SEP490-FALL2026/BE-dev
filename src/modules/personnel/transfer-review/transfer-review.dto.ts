import { createZodDto } from '../../../infrastructure/http/dto/zod-dto';
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
  /** Where the review came from: the transfer of the person, or the closing of the seat baseline at the setup (F21). */
  origin: z.enum(['TRANSFER', 'POST_SETUP']),
  employee: employeeBrief,
  department: departmentBrief,
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

/** A Request of the person that has not finished, listed for the head to read (F29): information only, nothing is decided here. */
const unfinishedRequestSchema = z.strictObject({
  requestId: z.uuid(),
  type: z.enum(['GRANT', 'SERVICE_ACCOUNT', 'RENEWAL', 'GROUP_GRANT']),
  state: z.string(),
  plan: nameBrief.nullable(),
});

export const transferReviewDetailSchema = transferReviewSummarySchema.extend({
  /** The head of the department today, who decides; null while it has none. */
  reviewer: employeeBrief.nullable(),
  transferId: z.uuid().nullable(),
  openedAt: z.iso.datetime(),
  completedAt: z.iso.datetime().nullable(),
  /** When the reminder of a late review was written; null while none was. */
  overdueNoticedAt: z.iso.datetime().nullable(),
  /**
   * The Requests of the person that have not been granted yet, at most twenty (F29): what is still on its way beside the tools they
   * hold. Information for the head; empty for the review after the setup.
   */
  unfinishedRequests: z.array(unfinishedRequestSchema).max(20),
});

/** A personal seat of the person who was transferred, with what was decided about it (F42: every personal seat is listed). */
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
  /**
   * The head said the tool is still needed, so a new Request of this department is asked for (T-6): the old seat goes when that
   * Request is granted or ends, or when the head changes the decision to "no longer needed". True only while that is still to come:
   * false once the Request ended and the old seat is being taken back, though the decision stays "still needed" (the revocation
   * is read from the seat, so `revocationTaskId` stays null for this decision).
   */
  needsNewRequest: z.boolean(),
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
