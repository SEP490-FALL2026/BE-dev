import { createZodDto } from '../../../infrastructure/http/dto/zod-dto';
import { z } from 'zod';
import { successEnvelopeSchema } from '../../../infrastructure/http/dto/success-envelope.dto';
import { WAITING_REASON_CODES } from '../step-routing/reassignment.policy';

export const controlledWaitListQuerySchema = z.strictObject({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});

const employeeRef = z.strictObject({ employeeId: z.uuid(), employeeCode: z.string(), fullName: z.string() });

/**
 * One step that waits under control: where it is, why, what ends the wait, and since when. It carries no amount, no code of the
 * check of the budget and no figure of a budget (`INF-06`): the people who read it configure roles, they do not decide.
 */
export const controlledWaitSchema = z.strictObject({
  requestId: z.uuid(),
  stepId: z.uuid(),
  stepKind: z.enum(['NEED', 'SPEND_APPROVAL', 'IT_ASSESSMENT']),
  waitingReason: z.enum(WAITING_REASON_CODES),
  configurationHint: z
    .enum(['CONFIGURE_SPENDING_APPROVER', 'ASSIGN_DEPARTMENT_HEAD', 'NAME_IT_ADMIN_IN_CHARGE'])
    .nullable(),
  waitingSince: z.iso.datetime(),
  /** When the people who can put it right were told of this stretch of waiting; null until the pass that tells them. */
  alertedAt: z.iso.datetime().nullable(),
  requester: employeeRef,
  department: z.strictObject({ id: z.uuid(), code: z.string(), name: z.string() }),
});

const pagination = z.strictObject({
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  totalItems: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
});

export class ControlledWaitListQueryDto extends createZodDto(controlledWaitListQuerySchema) {}
export class ControlledWaitListResponseDto extends createZodDto(
  successEnvelopeSchema(z.strictObject({ items: z.array(controlledWaitSchema), pagination })),
) {}

export type ControlledWaitWire = z.infer<typeof controlledWaitSchema>;
