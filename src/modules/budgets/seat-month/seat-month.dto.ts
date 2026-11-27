import { z } from 'zod';
import { successEnvelopeSchema } from '../../../infrastructure/http/dto/success-envelope.dto';
import { createZodDto } from '../../../infrastructure/http/dto/zod-dto';

const moneyView = z.strictObject({ amount: z.string(), currency: z.string() });

export const seatMonthChargesQuerySchema = z.strictObject({
  year: z.coerce.number().int().min(2000).max(2100).meta({ description: 'The year of the month, as YYYY.' }),
  month: z.coerce.number().int().min(1).max(12).meta({ description: 'The month, 1 to 12.' }),
  costCenterId: z.uuid().optional().meta({ description: 'Only the seat-months charged to this Cost Center.' }),
  subscriptionId: z.uuid().optional().meta({ description: 'Only the seat-months of this subscription of the pool.' }),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});

const seatMonthChargeSchema = z.strictObject({
  id: z.uuid(),
  subscriptionId: z.uuid(),
  assignmentId: z.uuid(),
  employee: z.strictObject({ employeeId: z.uuid(), employeeCode: z.string(), fullName: z.string() }).nullable(),
  department: z.strictObject({ id: z.uuid(), code: z.string(), name: z.string() }).nullable(),
  costCenter: z.strictObject({ id: z.uuid(), code: z.string(), name: z.string() }).nullable().meta({
    description:
      'The Cost Center that bears it; empty when the department has none yet (not allocated to a Cost Center).',
  }),
  days: z.number().int().positive().meta({ description: 'The days the seat was held in the department in the month.' }),
  daysInMonth: z.number().int().positive(),
  monthlyPrice: moneyView.meta({ description: 'The price of a month of the seat the days are counted against.' }),
  amount: moneyView.meta({ description: 'What the days cost the department.' }),
  appliedToCommitment: moneyView.meta({ description: 'What of the amount took the commitment of the seat down.' }),
});

const idleCostByLabelSchema = z.strictObject({
  missedAdjustment: moneyView,
  reducible: moneyView,
  lockedUntil: z.record(z.string(), moneyView),
});

const poolLineFlagsSchema = z.strictObject({
  NO_PRICE: z.boolean(),
  NO_QUANTITY: z.boolean(),
});

const poolLineSchema = z.strictObject({
  subscriptionId: z.uuid(),
  paid: moneyView.nullable().meta({
    description:
      'The seats paid for at the price of a month: the seats bought times the price of a month, for each month the purchase runs; null when the seats bought or the price is not known.',
  }),
  invoiced: moneyView.meta({
    description: 'What the invoices of the pool booked to the month cost: the proof of what was paid, not the line.',
  }),
  allocated: moneyView.meta({ description: 'What the seat-months of the month took of it.' }),
  idleCost: moneyView.nullable().meta({
    description:
      'The cost of idle paid seats for the month; null when monthly price or purchased quantity is not known.',
  }),
  idleCostByLabel: idleCostByLabelSchema.meta({
    description: 'Breakdown of idle seat cost by adjustment-window label.',
  }),
  invoiceVariance: moneyView.meta({
    description: 'Confirmed pool invoice variance assigned to the month.',
  }),
  invoiceVarianceInReview: moneyView.meta({
    description: 'Pool invoice variance awaiting Finance review.',
  }),
  deviceLotPurchases: moneyView.meta({
    description: 'Device-lot purchases booked to the shared pool in the month.',
  }),
  replacementKeys: moneyView.meta({
    description: 'Replacement license keys booked to the shared pool in the month.',
  }),
  unallocated: moneyView.meta({
    description:
      'Total shared-pool line for the month: sum of idle seat cost, invoice variances, device-lot purchases, and replacement keys when price and quantity are known, or invoiced amount less allocated seat-months otherwise.',
  }),
  withoutCostCenter: moneyView.meta({
    description:
      'The line "not allocated to a Cost Center": the part of the seat-months that fell to a department with no Cost Center yet. It is in no Cost Center and not in the line of the pool.',
  }),
  flags: poolLineFlagsSchema.meta({
    description: 'Data-quality flags indicating missing monthly price or purchased seat quantity.',
  }),
});

const pagination = z.strictObject({
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  totalItems: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
});

export class SeatMonthChargesQueryDto extends createZodDto(seatMonthChargesQuerySchema) {}
export class SeatMonthChargesResponseDto extends createZodDto(
  successEnvelopeSchema(
    z.strictObject({
      items: z.array(seatMonthChargeSchema),
      pagination,
      poolLines: z.array(poolLineSchema).max(100).meta({
        description:
          'The line of the shared pool of each subscription with an invoice or a seat-month in the month (Finance only; empty for a manager).',
      }),
    }),
  ),
) {}

export type SeatMonthChargeWire = z.infer<typeof seatMonthChargeSchema>;
export type SeatMonthPoolLineWire = z.infer<typeof poolLineSchema>;
