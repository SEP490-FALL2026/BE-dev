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

const poolLineSchema = z.strictObject({
  subscriptionId: z.uuid(),
  invoiced: moneyView.meta({ description: 'What the invoices of the pool for the month cost.' }),
  allocated: moneyView.meta({ description: 'What the seat-months of the month took of it.' }),
  unallocated: moneyView.meta({
    description:
      'The line "not allocated, shared pool": the invoices of the month less the seat-months charged to departments.',
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
