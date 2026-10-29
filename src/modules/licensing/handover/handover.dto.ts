import { createZodDto } from '../../../infrastructure/http/dto/zod-dto';
import { z } from 'zod';
import { successEnvelopeSchema } from '../../../infrastructure/http/dto/success-envelope.dto';
import { REVOCATION_SOURCES } from '../public/licensing.types';

const idParamSchema = z.strictObject({ id: z.uuid() });

const confirmBodySchema = z.strictObject({ value: z.enum(['HANDED_OVER', 'NOT_NEEDED', 'HANDLED']) });

const flag = z.enum(['true', 'false']).transform((value) => value === 'true');

const listQuerySchema = z.strictObject({
  scope: z.enum(['mine', 'all']).default('mine'),
  status: z.enum(['OPEN', 'CONFIRMED', 'CANCELLED']).optional(),
  employeeId: z.uuid().optional(),
  overdue: flag.optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});

const pagination = z.strictObject({
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  totalItems: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
});

const employeeBrief = z.strictObject({ id: z.uuid(), employeeCode: z.string(), fullName: z.string() });
const nameBrief = z.strictObject({ id: z.uuid(), name: z.string() });

/** The row of the list: the tool, the person it is taken from, who confirms, the deadline and where the duty stands. */
export const handoverDutySummarySchema = z.strictObject({
  id: z.uuid(),
  assignmentId: z.uuid(),
  application: nameBrief,
  plan: nameBrief,
  employee: employeeBrief,
  source: z.enum(REVOCATION_SOURCES),
  role: z.enum(['DEPARTMENT_HEAD', 'REQUESTER', 'IT_ADMIN']),
  status: z.enum(['OPEN', 'CONFIRMED', 'CANCELLED']),
  dataLoss: z.boolean(),
  dueOn: z.string(),
  overdue: z.boolean(),
  /** The revocation went on after the deadline without the confirmation. */
  flaggedUnconfirmed: z.boolean(),
  /** Why nobody is named yet, while nobody is; null once a person is. */
  waitingReason: z.enum(['NO_HEAD', 'NO_SUCCESSOR']).nullable(),
  /** Whether the caller is the person the duty falls to now. */
  canConfirm: z.boolean(),
});

const confirmationSchema = z.strictObject({
  value: z.enum(['HANDED_OVER', 'NOT_NEEDED', 'HANDLED']),
  role: z.enum(['DEPARTMENT_HEAD', 'DESIGNATED_SUCCESSOR', 'REQUESTER', 'IT_ADMIN']),
  confirmedBy: employeeBrief,
  confirmedAt: z.iso.datetime(),
  late: z.boolean(),
});

export const handoverDutyDetailSchema = handoverDutySummarySchema.extend({
  /** The notice of the plan before the revocation, as it was when the duty was opened. */
  noticeText: z.string().nullable(),
  /** The person the duty falls to now; null for the IT Admin role and while nobody is named. */
  confirmer: employeeBrief.nullable(),
  confirmation: confirmationSchema.nullable(),
  cancellation: z.strictObject({ cancelledAt: z.iso.datetime(), reason: z.string() }).nullable(),
  createdAt: z.iso.datetime(),
});

export type HandoverDutySummaryWire = z.infer<typeof handoverDutySummarySchema>;
export type HandoverDutyDetailWire = z.infer<typeof handoverDutyDetailSchema>;

export class HandoverDutyIdParamDto extends createZodDto(idParamSchema) {}
export class ConfirmHandoverBodyDto extends createZodDto(confirmBodySchema) {}
export class ListHandoverDutiesQueryDto extends createZodDto(listQuerySchema) {}
export class HandoverDutyDetailResponseDto extends createZodDto(successEnvelopeSchema(handoverDutyDetailSchema)) {}
export class HandoverDutyPageResponseDto extends createZodDto(
  successEnvelopeSchema(z.strictObject({ items: z.array(handoverDutySummarySchema), pagination })),
) {}
