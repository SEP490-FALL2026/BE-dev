import { z } from 'zod';
import { successEnvelopeSchema } from '../../../infrastructure/http/dto/success-envelope.dto';
import { createZodDto } from '../../../infrastructure/http/dto/zod-dto';

const money = z.strictObject({
  amount: z.string().max(40),
  currency: z.string().regex(/^[A-Z]{3}$/),
});

export const subscriptionLineParentParamSchema = z.strictObject({ id: z.uuid() });
export const subscriptionLineIdParamSchema = z.strictObject({ id: z.uuid() });

export const addSubscriptionLineBodySchema = z.strictObject({
  planId: z.uuid(),
  monthlyUnitPrice: money,
  minimumSeats: z.number().int().min(1).max(1_000_000).optional(),
  quantity: z.number().int().min(0).max(1_000_000).optional(),
  expectedUpdatedAt: z.iso.datetime(),
});

export const updateSubscriptionLineBodySchema = z.strictObject({
  monthlyUnitPrice: money.optional(),
  minimumSeats: z.number().int().min(1).max(1_000_000).nullable().optional(),
  expectedUpdatedAt: z.iso.datetime(),
});

export const seatChangeListQuerySchema = z.strictObject({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});

export const subscriptionLineDetailSchema = z.strictObject({
  id: z.uuid(),
  plan: z.strictObject({ id: z.uuid(), name: z.string() }),
  monthlyUnitPrice: money,
  minimumSeats: z.number().int().nullable(),
  seatsToday: z.number().int().nonnegative(),
  assignedToday: z.number().int().nonnegative(),
  freeToday: z.number().int().nonnegative(),
  closedOn: z.string().nullable(),
  closedReason: z.enum(['RENEWED', 'ENDED', 'REMOVED']).nullable(),
  updatedAt: z.iso.datetime(),
});

const seatChangeItemSchema = z.strictObject({
  id: z.uuid(),
  effectiveOn: z.string(),
  delta: z.number().int(),
  reason: z.enum([
    'INITIAL',
    'RENEWAL',
    'REQUEST_GRANT',
    'REQUEST_REFUND',
    'TOP_UP',
    'TIER_UP',
    'REDUCE',
    'CORRECTION',
  ]),
  source: z.enum(['REQUEST_ITEM', 'VENDOR_RECORD', 'ADJUSTMENT']),
  basis: z.enum(['ACTUAL', 'RECORDED', 'NONE']),
  request: z.strictObject({ id: z.uuid(), code: z.string().nullable() }).nullable(),
  beneficiary: z
    .strictObject({
      employeeId: z.uuid(),
      employeeCode: z.string(),
      fullName: z.string(),
    })
    .nullable(),
  seatPurchase: z.strictObject({ id: z.uuid(), code: z.string() }).nullable(),
  note: z.string().nullable(),
  outOfProcess: z.boolean(),
  autoRecorded: z.boolean(),
  recordedBy: z.strictObject({ employeeId: z.uuid(), fullName: z.string() }).nullable(),
  recordedAt: z.iso.datetime(),
});

export class SubscriptionLineParentParamDto extends createZodDto(subscriptionLineParentParamSchema) {}
export class SubscriptionLineIdParamDto extends createZodDto(subscriptionLineIdParamSchema) {}
export class AddSubscriptionLineBodyDto extends createZodDto(addSubscriptionLineBodySchema) {}
export class UpdateSubscriptionLineBodyDto extends createZodDto(updateSubscriptionLineBodySchema) {}
export class SeatChangeListQueryDto extends createZodDto(seatChangeListQuerySchema) {}
export class SubscriptionLineResponseDto extends createZodDto(successEnvelopeSchema(subscriptionLineDetailSchema)) {}
export class SeatChangePageResponseDto extends createZodDto(
  successEnvelopeSchema(
    z.strictObject({
      items: z.array(seatChangeItemSchema),
      pagination: z.strictObject({
        page: z.number().int().positive(),
        pageSize: z.number().int().positive(),
        totalItems: z.number().int().nonnegative(),
        totalPages: z.number().int().nonnegative(),
      }),
    }),
  ),
) {}
