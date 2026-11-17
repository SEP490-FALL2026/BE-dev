import { z } from 'zod';
import { createZodDto } from '../../../infrastructure/http/dto/zod-dto';

/** Why Finance returns the invoice: what the IT Admin reads to put it right before submitting it again. */
export const purchaseInvoiceReturnSchema = z.strictObject({
  reason: z
    .string()
    .trim()
    .min(1)
    .max(1000)
    .meta({ description: 'Why the invoice is returned. Required; the IT Admin reads it.' }),
});

export class PurchaseInvoiceReturnBodyDto extends createZodDto(purchaseInvoiceReturnSchema) {}
