import { z } from 'zod';
import { businessDate, responseBusinessDate } from '../../../infrastructure/http/dto/business-date.dto';
import { successEnvelopeSchema } from '../../../infrastructure/http/dto/success-envelope.dto';
import { createZodDto } from '../../../infrastructure/http/dto/zod-dto';

export const SEAT_PURCHASE_ITEMS_MAX = 50;

const money = z.strictObject({
  amount: z.string(),
  currency: z.string(),
});

const seatPurchaseItemSchema = z.strictObject({
  requestId: z.uuid().meta({ description: 'Approved request identifier waiting for a seat purchase.' }),
  beneficiaryEmployeeId: z.uuid().meta({ description: 'Beneficiary employee identifier for that request item.' }),
  taskId: z
    .uuid()
    .optional()
    .meta({ description: 'Open grant task identifier (required when the beneficiary is not placed in a department).' }),
});

export const seatPurchaseLineParamSchema = z.strictObject({ id: z.uuid() });

export const seatPurchaseBodySchema = z
  .strictObject({
    items: z
      .array(seatPurchaseItemSchema)
      .min(1)
      .max(SEAT_PURCHASE_ITEMS_MAX)
      .refine(
        (items) =>
          new Set(items.map((item) => `${item.requestId}:${item.beneficiaryEmployeeId}`)).size === items.length,
        { message: 'Each (requestId, beneficiaryEmployeeId) pair may appear only once.' },
      )
      .meta({ description: 'Unique pending request items receiving newly bought seats.' }),
    purchasedOn: businessDate.meta({ description: 'Business date when the seats are purchased from the vendor.' }),
    tierStepSeats: z.number().int().positive().max(10_000).optional().meta({
      description:
        'Optional vendor tier-step seat count (requires items.length === 1; cannot combine with replacesFromLineId).',
    }),
    replacesFromLineId: z.uuid().optional().meta({
      description:
        'Optional source subscription line whose seat is replaced in the same transaction (requires items.length === 1).',
    }),
  })
  .refine((body) => !(body.tierStepSeats !== undefined && body.replacesFromLineId !== undefined), {
    message: 'tierStepSeats and replacesFromLineId cannot be provided together.',
    path: ['tierStepSeats'],
  });

const seatChangeItemSchema = z.strictObject({
  id: z.uuid(),
  effectiveOn: responseBusinessDate,
  delta: z.number().int(),
  reason: z.enum(['INITIAL', 'TOP_UP', 'RENEWAL', 'REDUCE']),
  source: z.enum(['GRANT', 'ADJUSTMENT', 'VENDOR_RECORD', 'MEMBER']),
  basis: z.enum(['REQUEST_ITEM', 'NONE']),
  requestId: z.uuid().nullable(),
  beneficiaryEmployeeId: z.uuid().nullable(),
  seatPurchaseId: z.uuid().nullable(),
});

export const seatPurchaseResponseSchema = z.strictObject({
  id: z.uuid(),
  code: z.string(),
  quantity: z.number().int().positive(),
  purchasedOn: responseBusinessDate,
  invoiceObligation: z.enum(['WORKING_DAYS', 'NONE', 'LATE_INVOICE']),
  invoiceDueOn: responseBusinessDate.nullable(),
  expectedAmount: money.nullable(),
  changes: z.array(seatChangeItemSchema).max(SEAT_PURCHASE_ITEMS_MAX),
});

export class SeatPurchaseLineParamDto extends createZodDto(seatPurchaseLineParamSchema) {}
export class SeatPurchaseBodyDto extends createZodDto(seatPurchaseBodySchema) {}
export class SeatPurchaseResponseDto extends createZodDto(successEnvelopeSchema(seatPurchaseResponseSchema)) {}

export type SeatPurchaseBody = z.infer<typeof seatPurchaseBodySchema>;
export type SeatPurchaseWire = z.infer<typeof seatPurchaseResponseSchema>;
