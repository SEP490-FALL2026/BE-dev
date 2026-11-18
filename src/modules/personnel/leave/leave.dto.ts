import { createZodDto } from '../../../infrastructure/http/dto/zod-dto';
import { z } from 'zod';
import { successEnvelopeSchema } from '../../../infrastructure/http/dto/success-envelope.dto';
import { businessDay } from '../../../infrastructure/http/dto/business-date.dto';
import { groundsNoteBodySchema } from '../personnel-grounds.dto';

const flag = z.enum(['true', 'false']).transform((value) => value === 'true');

/** Strict: a field the route does not know, such as the reason for the leave, is refused and never kept. */
const startBodySchema = z.strictObject({
  employeeId: z.uuid(),
  startedOn: businessDay,
  approvedReturnOn: businessDay,
  groundsNote: groundsNoteBodySchema,
});

const changeReturnDateBodySchema = z.strictObject({
  newApprovedReturnOn: businessDay,
  groundsNote: groundsNoteBodySchema,
});

const confirmReturnBodySchema = z.strictObject({
  returnedOn: businessDay,
  // Always needed, on the approved day too (R-32): the interface fills it from `GET /long-leaves/{id}`, the Super Admin may edit it.
  groundsNote: groundsNoteBodySchema,
});

const listQuerySchema = z.strictObject({
  status: z.enum(['ACTIVE', 'ENDED']).optional(),
  employeeId: z.uuid().optional(),
  overdueReturn: flag.optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});

const changesQuerySchema = z.strictObject({
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
/** The row of the list: who, since when, due back when, and whether the day has passed without the person back. */
export const leaveSummarySchema = z.strictObject({
  id: z.uuid(),
  employee: employeeBrief,
  status: z.enum(['ACTIVE', 'ENDED']),
  startedOn: z.string(),
  approvedReturnOn: z.string(),
  endedOn: z.string().nullable(),
  overdueReturn: z.boolean(),
});

export const leaveDetailSchema = leaveSummarySchema.extend({
  /** The basis of the approved day of return in force, as the one box it was written in: what a form fills in again. Null in the minimal projection an IT Admin reads. */
  groundsNote: z.string().nullable(),
  endKind: z.enum(['RETURNED', 'DEPARTURE_STARTED']).nullable(),
  resumesLeaveId: z.uuid().nullable(),
  /** The account that started it; null when the controlled procedure did (`startedByProcedure`). */
  startedByAppUserId: z.uuid().nullable(),
  /** True when the leave was recorded by the controlled procedure `pnpm ops:record-super-admin-event` and not by an account. */
  startedByProcedure: z.boolean(),
  startedAt: z.iso.datetime(),
});

const changeSchema = z.strictObject({
  id: z.uuid(),
  kind: z.enum(['STARTED', 'RETURN_DATE_CHANGED', 'RETURNED', 'ENDED_FOR_DEPARTURE', 'RESUMED']),
  oldReturnOn: z.string().nullable(),
  newReturnOn: z.string().nullable(),
  returnedOn: z.string().nullable(),
  onSchedule: z.boolean().nullable(),
  /** The basis the change was written on, in one box; null for a return on the approved day, which needs none. */
  groundsNote: z.string().nullable(),
  /** The account that recorded it; null when the controlled procedure did (`recordedByProcedure`). */
  recordedByAppUserId: z.uuid().nullable(),
  recordedByProcedure: z.boolean(),
  recordedAt: z.iso.datetime(),
});

export type LeaveSummaryWire = z.infer<typeof leaveSummarySchema>;
export type LeaveDetailWire = z.infer<typeof leaveDetailSchema>;
export type LeaveChangeWire = z.infer<typeof changeSchema>;

export class StartLeaveBodyDto extends createZodDto(startBodySchema) {}
export class ChangeReturnDateBodyDto extends createZodDto(changeReturnDateBodySchema) {}
export class ConfirmReturnBodyDto extends createZodDto(confirmReturnBodySchema) {}
export class ListLeavesQueryDto extends createZodDto(listQuerySchema) {}
export class ListLeaveChangesQueryDto extends createZodDto(changesQuerySchema) {}
export class LeaveIdParamDto extends createZodDto(idParamSchema) {}
export class LeaveDetailResponseDto extends createZodDto(successEnvelopeSchema(leaveDetailSchema)) {}
export class LeavePageResponseDto extends createZodDto(
  successEnvelopeSchema(z.strictObject({ items: z.array(leaveSummarySchema), pagination })),
) {}
export class LeaveChangePageResponseDto extends createZodDto(
  successEnvelopeSchema(z.strictObject({ items: z.array(changeSchema), pagination })),
) {}
