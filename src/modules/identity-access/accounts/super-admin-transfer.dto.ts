import { z } from 'zod';
import { successEnvelopeSchema } from '../../../infrastructure/http/dto/success-envelope.dto';
import { createZodDto } from '../../../infrastructure/http/dto/zod-dto';

export const superAdminTransferBodySchema = z.strictObject({ successorAppUserId: z.uuid() });

const transferSchema = z.strictObject({
  transferId: z.uuid(),
  from: z.strictObject({ appUserId: z.uuid() }),
  to: z.strictObject({ appUserId: z.uuid() }),
});

export class SuperAdminTransferBodyDto extends createZodDto(superAdminTransferBodySchema) {}
export class SuperAdminTransferResponseDto extends createZodDto(successEnvelopeSchema(transferSchema)) {}
