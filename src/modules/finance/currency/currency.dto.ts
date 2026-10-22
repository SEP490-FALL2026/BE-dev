import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { successEnvelopeSchema } from '../../../infrastructure/http/dto/success-envelope.dto';

const currencyListSchema = z.strictObject({
  items: z.array(
    z.strictObject({
      code: z.string(),
      name: z.string(),
      minorUnit: z.number().int().nonnegative().describe('Decimal digits of the currency: 0 for VND, 2 for USD.'),
    }),
  ),
});

export class CurrencyListResponseDto extends createZodDto(successEnvelopeSchema(currencyListSchema)) {}
