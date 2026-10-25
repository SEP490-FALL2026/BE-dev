import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { successEnvelopeSchema } from '../../../infrastructure/http/dto/success-envelope.dto';

const flag = z.enum(['true', 'false']).transform((value) => value === 'true');
const pageQuery = {
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
};
const pagination = z.strictObject({
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  totalItems: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
});

const QUEUE_STATUSES = ['WAITING_RENEWAL_DECISION', 'READY_TO_REVOKE', 'REVOCATION_OPEN'] as const;
const AUDIENCES = ['EMPLOYEE', 'HEAD', 'IT_ADMIN'] as const;

const queueQuerySchema = z.strictObject({
  status: z.enum(QUEUE_STATUSES).optional(),
  debt: flag.optional(),
  departmentId: z.uuid().optional(),
  ...pageQuery,
});
const reminderQuerySchema = z.strictObject({
  scope: z.enum(['mine', 'all']).default('mine'),
  audience: z.enum(AUDIENCES).optional(),
  assignmentId: z.uuid().optional(),
  ...pageQuery,
});
const assignmentParamSchema = z.strictObject({ assignmentId: z.uuid() });

const employeeBrief = z.strictObject({ id: z.uuid(), employeeCode: z.string(), fullName: z.string() });
const planBrief = z.strictObject({
  planId: z.uuid(),
  planName: z.string(),
  applicationId: z.uuid(),
  applicationName: z.string(),
});

/** An open personal right whose end day has passed, and where it stands for the IT Admin. */
export const expiredRightSchema = z.strictObject({
  assignmentId: z.uuid(),
  employee: employeeBrief,
  department: z.strictObject({ id: z.uuid(), code: z.string(), name: z.string() }).nullable(),
  plan: planBrief.extend({ provisioningType: z.enum(['K1', 'K2', 'K3', 'K4', 'K5']), dataLossOnRemoval: z.boolean() }),
  expectedEndDate: z.string(),
  daysOverdue: z.number().int().positive(),
  /** More than seven days without being handled. Only a flag: the dashboard that shows it is another item. */
  debt: z.boolean(),
  status: z.enum(QUEUE_STATUSES),
  /** The renewal that waits for its decision, while one does. */
  pendingRenewal: z.strictObject({ requestId: z.uuid(), state: z.string() }).nullable(),
  /** The revocation that is under way, while one is. */
  revocation: z.strictObject({ taskId: z.uuid(), status: z.string() }).nullable(),
  /** The confirmation of the handover of the data of the tool: who it falls to, until when, whether the work went on without it. */
  handover: z
    .strictObject({
      dutyId: z.uuid(),
      status: z.enum(['OPEN', 'CONFIRMED', 'CANCELLED']),
      role: z.enum(['DEPARTMENT_HEAD', 'REQUESTER', 'IT_ADMIN']),
      dueOn: z.string(),
      overdue: z.boolean(),
      flaggedUnconfirmed: z.boolean(),
    })
    .nullable(),
});

/** What opening the revocation of a right that ended did: a task was made, or the right had one and the reason was added. */
export const startedRevocationSchema = z.strictObject({
  assignmentId: z.uuid(),
  taskId: z.uuid(),
  taskStatus: z.string(),
  created: z.boolean(),
  reasonAdded: z.boolean(),
});

/** A reminder that a right is about to end, sent to one person; it offers two choices, to renew the right or to let it end. */
export const expiryReminderSchema = z.strictObject({
  id: z.uuid(),
  assignmentId: z.uuid(),
  audience: z.enum(AUDIENCES),
  expectedEndDate: z.string(),
  recipient: employeeBrief,
  holder: employeeBrief,
  plan: planBrief,
  createdAt: z.iso.datetime(),
});

export type ExpiredRightWire = z.infer<typeof expiredRightSchema>;
export type StartedRevocationWire = z.infer<typeof startedRevocationSchema>;
export type ExpiryReminderWire = z.infer<typeof expiryReminderSchema>;

export class ListExpiryQueueQueryDto extends createZodDto(queueQuerySchema) {}
export class ListExpiryRemindersQueryDto extends createZodDto(reminderQuerySchema) {}
export class ExpiryAssignmentParamDto extends createZodDto(assignmentParamSchema) {}
export class ExpiryQueuePageResponseDto extends createZodDto(
  successEnvelopeSchema(z.strictObject({ items: z.array(expiredRightSchema), pagination })),
) {}
export class ExpiryReminderPageResponseDto extends createZodDto(
  successEnvelopeSchema(z.strictObject({ items: z.array(expiryReminderSchema), pagination })),
) {}
export class StartedRevocationResponseDto extends createZodDto(
  successEnvelopeSchema(z.strictObject({ revocation: startedRevocationSchema })),
) {}
