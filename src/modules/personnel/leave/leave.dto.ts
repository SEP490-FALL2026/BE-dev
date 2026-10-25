import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { isBusinessDate } from '../../../core/business-date';
import { successEnvelopeSchema } from '../../../infrastructure/http/dto/success-envelope.dto';

const businessDate = z.string().refine(isBusinessDate, { message: 'The day must be a real date as YYYY-MM-DD.' });
const flag = z.enum(['true', 'false']).transform((value) => value === 'true');

/**
 * The basis a day rests on. Every part is optional here and judged after: a basis that is empty or lacks a part has its own answer,
 * and so has a reference that is the code of a notice, which is not the document that approves the leave.
 */
const groundsBodySchema = z.strictObject({
  type: z.string().max(100).nullish(),
  reference: z.string().max(200).nullish(),
  issuer: z.string().max(200).nullish(),
  issuedOn: z.string().max(10).nullish(),
});

/** Strict: a field the route does not know, such as the reason for the leave, is refused and never kept. */
const startBodySchema = z.strictObject({
  employeeId: z.uuid(),
  startedOn: businessDate,
  approvedReturnOn: businessDate,
  grounds: groundsBodySchema.optional(),
});

const changeReturnDateBodySchema = z.strictObject({
  newApprovedReturnOn: businessDate,
  grounds: groundsBodySchema.optional(),
});

const confirmReturnBodySchema = z.strictObject({
  returnedOn: businessDate,
  grounds: groundsBodySchema.optional(),
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
const groundsSchema = z.strictObject({
  type: z.string(),
  reference: z.string(),
  issuer: z.string(),
  issuedOn: z.string(),
});

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
  /** The basis of the approved day of return in force. */
  grounds: groundsSchema,
  endKind: z.enum(['RETURNED', 'DEPARTURE_STARTED']).nullable(),
  resumesLeaveId: z.uuid().nullable(),
  startedByAppUserId: z.uuid(),
  startedAt: z.iso.datetime(),
  selfExecuted: z.boolean(),
});

const changeSchema = z.strictObject({
  id: z.uuid(),
  kind: z.enum(['STARTED', 'RETURN_DATE_CHANGED', 'RETURNED', 'ENDED_FOR_DEPARTURE', 'RESUMED']),
  oldReturnOn: z.string().nullable(),
  newReturnOn: z.string().nullable(),
  returnedOn: z.string().nullable(),
  onSchedule: z.boolean().nullable(),
  grounds: groundsSchema.nullable(),
  recordedByAppUserId: z.uuid(),
  recordedAt: z.iso.datetime(),
  selfExecuted: z.boolean(),
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
