import { createZodDto } from '../../../infrastructure/http/dto/zod-dto';
import { z } from 'zod';
import { isBusinessDate } from '../../../core/business-date';
import { successEnvelopeSchema } from '../../../infrastructure/http/dto/success-envelope.dto';
import { NOTICE_KINDS, SENDABLE_NOTICE_KINDS, VERIFICATION_METHODS } from './notice.types';

const businessDate = z.string().refine(isBusinessDate, { message: 'The day must be a real date as YYYY-MM-DD.' });
const flag = z.enum(['true', 'false']).transform((value) => value === 'true');
const kindSchema = z.enum(NOTICE_KINDS);
const statusSchema = z.enum(['PENDING_VERIFICATION', 'RECORDED', 'REJECTED', 'WITHDRAWN']);

/**
 * The basis of the event. Every part is optional here and judged after: a basis that is empty or lacks a part has its own answer,
 * and so has a reference that is only the code of a notice, which is not an authoritative document.
 */
const groundsBodySchema = z.strictObject({
  type: z.string().max(100).nullish(),
  reference: z.string().max(200).nullish(),
  issuer: z.string().max(200).nullish(),
  issuedOn: z.string().max(10).nullish(),
});

const verificationBodySchema = z.strictObject({
  method: z.enum(VERIFICATION_METHODS),
  reference: z.string().max(300),
});

/** Strict: a field the route does not know, such as a reason for leaving, is refused and never kept. */
const sendBodySchema = z.strictObject({
  employeeId: z.uuid(),
  /** A change of job title is not told any more: that kind is refused as a malformed body (`QĐ-87e`). */
  kind: z.enum(SENDABLE_NOTICE_KINDS),
  proposedOn: businessDate,
  targetDepartmentId: z.uuid().optional(),
  note: z.string().max(500).optional(),
});

const successorSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('EMPLOYEE'), employeeId: z.uuid() }),
  z.strictObject({ kind: z.literal('NONE') }),
]);

/** The event the notice is recorded as; which fields it needs depends on the kind of the notice and is judged after. */
const eventBodySchema = z.strictObject({
  toDepartmentId: z.uuid().optional(),
  effectiveOn: businessDate.optional(),
  lastWorkingDay: businessDate.optional(),
  successor: successorSchema.optional(),
  pendingTransferCancellation: z.strictObject({ reason: z.string().min(1).max(500) }).optional(),
  startedOn: businessDate.optional(),
  approvedReturnOn: businessDate.optional(),
});

const rejectBodySchema = z.strictObject({ reason: z.string().min(1).max(1000) });
const recordBodySchema = z.strictObject({
  verification: verificationBodySchema,
  grounds: groundsBodySchema.optional(),
  event: eventBodySchema,
});
const linkBodySchema = z.strictObject({ eventId: z.uuid(), verification: verificationBodySchema });

const listQuerySchema = z.strictObject({
  status: statusSchema.optional(),
  kind: kindSchema.optional(),
  employeeId: z.uuid().optional(),
  overdue: flag.optional(),
  priority: flag.optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});

const idParamSchema = z.strictObject({ id: z.uuid() });

const pagination = z.strictObject({
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  totalItems: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
});

const employeeBrief = z.strictObject({ id: z.uuid(), employeeCode: z.string(), fullName: z.string() });

/** The row of the list: the code, who it is about, the kind, the day proposed, where it stands, and whether it is late. */
export const noticeSummarySchema = z.strictObject({
  id: z.uuid(),
  code: z.string(),
  employee: employeeBrief,
  kind: kindSchema,
  proposedOn: z.string(),
  status: statusSchema,
  dueOn: z.string(),
  overdue: z.boolean(),
  priority: z.boolean(),
});

export const noticeDetailSchema = noticeSummarySchema.extend({
  note: z.string().nullable(),
  sender: employeeBrief,
  targetDepartment: z.strictObject({ id: z.uuid(), code: z.string(), name: z.string() }).nullable(),
  createdAt: z.iso.datetime(),
  defaultItAdminEmployeeId: z.uuid().nullable(),
  rejectReason: z.string().nullable(),
  recordedEvent: z
    .strictObject({
      kind: z.enum(['DEPARTMENT_TRANSFER', 'LONG_LEAVE', 'OFFBOARDING_CASE']),
      id: z.uuid(),
    })
    .nullable(),
  handledAt: z.iso.datetime().nullable(),
  overdueNoticedAt: z.iso.datetime().nullable(),
  /** How the IT Admin checked the notice; only the IT Admin sees it, so a head reads null. */
  verification: z
    .strictObject({
      method: z.enum(VERIFICATION_METHODS),
      reference: z.string(),
      /** Null only for a verification the controlled procedure of the release after this one recorded (spec L.2). */
      verifiedByAppUserId: z.uuid().nullable(),
      verifiedAt: z.iso.datetime(),
    })
    .nullable(),
});

export type NoticeSummaryWire = z.infer<typeof noticeSummarySchema>;
export type NoticeDetailWire = z.infer<typeof noticeDetailSchema>;

export class SendNoticeBodyDto extends createZodDto(sendBodySchema) {}
export class RejectNoticeBodyDto extends createZodDto(rejectBodySchema) {}
export class RecordNoticeBodyDto extends createZodDto(recordBodySchema) {}
export class LinkNoticeBodyDto extends createZodDto(linkBodySchema) {}
export class ListNoticesQueryDto extends createZodDto(listQuerySchema) {}
export class NoticeIdParamDto extends createZodDto(idParamSchema) {}
export class NoticeDetailResponseDto extends createZodDto(successEnvelopeSchema(noticeDetailSchema)) {}
export class NoticePageResponseDto extends createZodDto(
  successEnvelopeSchema(z.strictObject({ items: z.array(noticeSummarySchema), pagination })),
) {}
