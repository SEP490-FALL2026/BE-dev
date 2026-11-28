import { z } from 'zod';
import { responseBusinessDate } from '../../../infrastructure/http/dto/business-date.dto';
import { successEnvelopeSchema } from '../../../infrastructure/http/dto/success-envelope.dto';
import { createZodDto } from '../../../infrastructure/http/dto/zod-dto';
import { DEVICE_CONDITIONS } from '../devices-custody.policy';
import { OPEN_RETURN_TASK_ACTING_IT_ADMINS_MAX } from '../registry/registry.dto';

const booleanQueryFlag = z.enum(['true', 'false']).transform((value) => value === 'true');
const uniqueActivationIds = (items: readonly { activationId: string }[]) =>
  new Set(items.map((item) => item.activationId)).size === items.length;

export const RETURN_TASK_LIST_STATES = ['OPEN', 'CLOSED', 'ALL'] as const;
export const RETURN_TASK_SCOPES = ['MINE', 'ALL'] as const;

export const deviceReturnTaskIdParamSchema = z.strictObject({ id: z.uuid() });

export const deviceReturnTaskListQuerySchema = z.strictObject({
  scope: z
    .enum(RETURN_TASK_SCOPES)
    .default('MINE')
    .meta({ description: 'Whether to list tasks the caller acts on (MINE) or all readable tasks (ALL).' }),
  state: z
    .enum(RETURN_TASK_LIST_STATES)
    .default('OPEN')
    .meta({ description: 'Filter by open tasks, closed tasks, or all tasks; defaults to OPEN.' }),
  overdue: booleanQueryFlag.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const deviceReturnTaskCompleteBodySchema = z.strictObject({
  outcome: z.enum(['RECEIVED', 'NOT_RECOVERED']),
  condition: z.enum(DEVICE_CONDITIONS).optional(),
  conditionNote: z.string().trim().min(1).max(1000).optional(),
  softwareRemoval: z
    .strictObject({
      outcome: z.enum(['REMOVED', 'NOT_REMOVABLE']),
      note: z.string().max(1000).optional(),
    })
    .optional(),
  reason: z.string().trim().min(1).max(1000).optional(),
  activationDecisions: z
    .array(
      z.strictObject({
        activationId: z.uuid(),
        licenseRelease: z.enum(['RETURN_TO_LOT', 'LOST_WITH_DEVICE']),
      }),
    )
    .max(50)
    .refine(uniqueActivationIds, 'activationDecisions must name each activation once')
    .optional(),
});

const instant = z.iso.datetime();

export const deviceReturnTaskItemSchema = z.strictObject({
  id: z.uuid(),
  device: z.strictObject({
    id: z.uuid(),
    assetCode: z.string(),
    hostname: z.string(),
  }),
  employee: z.strictObject({
    id: z.uuid(),
    employeeCode: z.string(),
    fullName: z.string(),
  }),
  offboardingCaseId: z.uuid(),
  department: z.strictObject({ id: z.uuid(), name: z.string() }).nullable(),
  actingItAdmins: z
    .array(z.strictObject({ id: z.uuid(), fullName: z.string(), bySubstitute: z.boolean() }))
    .max(OPEN_RETURN_TASK_ACTING_IT_ADMINS_MAX),
  waiting: z.boolean(),
  dueOn: responseBusinessDate,
  overdue: z.boolean(),
  state: z.enum(['OPEN', 'RECEIVED', 'NOT_RECOVERED', 'CANCELLED']),
  handledAt: instant.nullable(),
});

const pagination = z.strictObject({
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  totalItems: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
});

export class DeviceReturnTaskIdParamDto extends createZodDto(deviceReturnTaskIdParamSchema) {}
export class DeviceReturnTaskListQueryDto extends createZodDto(deviceReturnTaskListQuerySchema) {}
export class DeviceReturnTaskCompleteBodyDto extends createZodDto(deviceReturnTaskCompleteBodySchema) {}
export class DeviceReturnTaskResponseDto extends createZodDto(
  successEnvelopeSchema(z.strictObject({ task: deviceReturnTaskItemSchema })),
) {}
export class DeviceReturnTaskPageResponseDto extends createZodDto(
  successEnvelopeSchema(z.strictObject({ items: z.array(deviceReturnTaskItemSchema), pagination })),
) {}
