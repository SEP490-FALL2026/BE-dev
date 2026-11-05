import { z } from 'zod';
import { responseBusinessDate } from '../../../infrastructure/http/dto/business-date.dto';
import { successEnvelopeSchema } from '../../../infrastructure/http/dto/success-envelope.dto';
import { createZodDto } from '../../../infrastructure/http/dto/zod-dto';

export const myDeviceListQuerySchema = z.strictObject({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});

const myDeviceSchema = z.strictObject({
  registrationId: z.uuid(),
  deviceId: z.uuid(),
  assetCode: z.string(),
  hostname: z.string(),
  os: z.string(),
  validFrom: responseBusinessDate,
  endedAt: z.iso.datetime().nullable(),
  acknowledgementState: z.enum(['UNACKNOWLEDGED', 'ACKNOWLEDGED', 'STOPPED', 'ENDED']),
  acknowledgedVersionNumber: z.number().int().nullable(),
  signatureRecorded: z.boolean(),
  canAcknowledge: z.boolean(),
  blockedReason: z
    .enum(['SIGNATURE_RECORD_MISSING', 'NOTICE_NOT_PUBLISHED', 'REGISTRATION_ENDED', 'ALREADY_ACKNOWLEDGED'])
    .nullable(),
});

export class MyDeviceListQueryDto extends createZodDto(myDeviceListQuerySchema) {}
export class MyDevicePageResponseDto extends createZodDto(
  successEnvelopeSchema(
    z.strictObject({
      items: z.array(myDeviceSchema),
      pagination: z.strictObject({
        page: z.number().int().positive(),
        pageSize: z.number().int().positive(),
        totalItems: z.number().int().nonnegative(),
        totalPages: z.number().int().nonnegative(),
      }),
    }),
  ),
) {}
