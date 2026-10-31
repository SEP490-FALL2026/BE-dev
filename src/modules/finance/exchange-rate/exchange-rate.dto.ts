import { z } from 'zod';
import { successEnvelopeSchema } from '../../../infrastructure/http/dto/success-envelope.dto';
import { createZodDto } from '../../../infrastructure/http/dto/zod-dto';
import { businessDate } from '../../../infrastructure/http/dto/business-date.dto';

const currencyCode = z.string().regex(/^[A-Z]{3}$/);
/** A real calendar day as `YYYY-MM-DD`; a refinement, so the OpenAPI document carries no generated date pattern. */

/**
 * The rate is a string on the wire, never a JSON number (ADR-0007). Whether it is a well-formed decimal, has at most
 * ten decimals and lies in range is judged by `core/money` and answers with its own error code.
 */
export const recordExchangeRateBodySchema = z.strictObject({
  currency: currencyCode,
  rateDate: businessDate,
  rate: z.string().max(40),
});

export const listExchangeRatesQuerySchema = z.strictObject({
  currency: currencyCode.optional(),
  from: businessDate.optional(),
  to: businessDate.optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});

const exchangeRateSchema = z.strictObject({
  id: z.uuid(),
  currency: z.string(),
  rateDate: z.string(),
  rate: z.string().describe('Decimal string: units of the reporting currency for one unit of `currency`.'),
  reportingCurrency: z.string(),
  source: z.literal('MANUAL'),
  createdAt: z.iso.datetime(),
});

const exchangeRatePageSchema = z.strictObject({
  items: z.array(exchangeRateSchema),
  pagination: z.strictObject({
    page: z.number().int().positive(),
    pageSize: z.number().int().positive(),
    totalItems: z.number().int().nonnegative(),
    totalPages: z.number().int().nonnegative(),
  }),
});

export class RecordExchangeRateBodyDto extends createZodDto(recordExchangeRateBodySchema) {}
export class ListExchangeRatesQueryDto extends createZodDto(listExchangeRatesQuerySchema) {}
export class ExchangeRateResponseDto extends createZodDto(successEnvelopeSchema(exchangeRateSchema)) {}
export class ExchangeRatePageResponseDto extends createZodDto(successEnvelopeSchema(exchangeRatePageSchema)) {}
