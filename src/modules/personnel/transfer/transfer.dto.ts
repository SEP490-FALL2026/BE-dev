import { createZodDto } from '../../../infrastructure/http/dto/zod-dto';
import { z } from 'zod';
import { successEnvelopeSchema } from '../../../infrastructure/http/dto/success-envelope.dto';
import { businessDay } from '../../../infrastructure/http/dto/business-date.dto';
import { groundsBodySchema } from '../personnel-grounds.dto';

const successorBodySchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('EMPLOYEE'), employeeId: z.uuid() }),
  z.strictObject({ kind: z.literal('NONE') }),
]);

/** A transfer changes the department only (`QĐ-87e`): a body that names a job title is a malformed body. */
const recordBodySchema = z.strictObject({
  employeeId: z.uuid(),
  toDepartmentId: z.uuid(),
  effectiveOn: businessDay,
  grounds: groundsBodySchema,
  successor: successorBodySchema.optional(),
});

const rescheduleBodySchema = z.strictObject({
  newEffectiveOn: businessDay,
  reason: z.string().trim().min(1).max(1000),
  grounds: groundsBodySchema,
  successor: successorBodySchema.optional(),
});

const cancelBodySchema = z.strictObject({
  reason: z.string().trim().min(1).max(1000),
  grounds: groundsBodySchema,
});

const listQuerySchema = z.strictObject({
  employeeId: z.uuid().optional(),
  status: z.enum(['PENDING', 'EFFECTIVE', 'CANCELLED']).optional(),
  effectiveFrom: businessDay.optional(),
  effectiveTo: businessDay.optional(),
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
const departmentBrief = z.strictObject({ id: z.uuid(), code: z.string(), name: z.string() });
const place = z.strictObject({ department: departmentBrief });
/** The basis as it was kept: the box in `reference`; the other three parts are present only for an event written before the box. */
const groundsSchema = z.strictObject({
  type: z.string().nullable(),
  reference: z.string(),
  issuer: z.string().nullable(),
  issuedOn: z.string().nullable(),
});

/** The row of the list: who, from where to where, when, and where it stands. */
export const transferSummarySchema = z.strictObject({
  id: z.uuid(),
  employee: employeeBrief,
  from: place,
  to: place,
  effectiveOn: z.string(),
  status: z.enum(['PENDING', 'EFFECTIVE', 'CANCELLED']),
});

export const transferDetailSchema = transferSummarySchema.extend({
  /** The basis of the transfer. Null in the minimal projection an IT Admin reads. */
  grounds: groundsSchema.nullable(),
  /** Who follows the head of the old department; null when the person did not head the department they leave, and in the minimal projection. */
  headSuccessor: z.strictObject({ kind: z.enum(['EMPLOYEE', 'NONE']), employee: employeeBrief.nullable() }).nullable(),
  /** The account that recorded it; null when the controlled procedure did (`recordedByProcedure`). */
  recordedByAppUserId: z.uuid().nullable(),
  /** True when the event was recorded by the controlled procedure `pnpm ops:record-super-admin-event` and not by an account. */
  recordedByProcedure: z.boolean(),
  recordedAt: z.iso.datetime(),
  effectiveAt: z.iso.datetime().nullable(),
  /** How it was cancelled; null while it was not, and in the minimal projection. */
  cancellation: z
    .strictObject({
      cancelledAt: z.iso.datetime(),
      cancelledByAppUserId: z.uuid().nullable(),
      cancelledByProcedure: z.boolean(),
      reason: z.string(),
    })
    .nullable(),
  /** Set when the IT Admin closed the transfer after the people who answer for the service accounts of the person were named. */
  closure: z.strictObject({ closedAt: z.iso.datetime(), closedByAppUserId: z.uuid() }).nullable(),
});

/** What recording a transfer answers with: the transfer as the detail shows it (the warning about Business Owner applications is gone, `QĐ-111g`). */
export const transferRecordedSchema = transferDetailSchema;

const changeSchema = z.strictObject({
  id: z.uuid(),
  kind: z.enum(['RESCHEDULED', 'CANCELLED']),
  oldEffectiveOn: z.string(),
  newEffectiveOn: z.string().nullable(),
  reason: z.string(),
  grounds: groundsSchema,
  /** The account that changed it; null when the controlled procedure did (`changedByProcedure`). */
  changedByAppUserId: z.uuid().nullable(),
  changedByProcedure: z.boolean(),
  changedAt: z.iso.datetime(),
});

export type TransferSummaryWire = z.infer<typeof transferSummarySchema>;
export type TransferDetailWire = z.infer<typeof transferDetailSchema>;
export type TransferRecordedWire = z.infer<typeof transferRecordedSchema>;
export type TransferChangeWire = z.infer<typeof changeSchema>;

export class RecordTransferBodyDto extends createZodDto(recordBodySchema) {}
export class RescheduleTransferBodyDto extends createZodDto(rescheduleBodySchema) {}
export class CancelTransferBodyDto extends createZodDto(cancelBodySchema) {}
export class ListTransfersQueryDto extends createZodDto(listQuerySchema) {}
export class ListTransferChangesQueryDto extends createZodDto(changesQuerySchema) {}
export class TransferIdParamDto extends createZodDto(idParamSchema) {}
export class TransferRecordedResponseDto extends createZodDto(successEnvelopeSchema(transferRecordedSchema)) {}
export class TransferDetailResponseDto extends createZodDto(successEnvelopeSchema(transferDetailSchema)) {}
export class TransferPageResponseDto extends createZodDto(
  successEnvelopeSchema(z.strictObject({ items: z.array(transferSummarySchema), pagination })),
) {}
export class TransferChangePageResponseDto extends createZodDto(
  successEnvelopeSchema(z.strictObject({ items: z.array(changeSchema), pagination })),
) {}
