import { z } from 'zod';
import { createZodDto } from '../../../infrastructure/http/dto/zod-dto';
import { deviceCreateBodySchema } from '../registry/registry.dto';

export const INITIAL_KEY_ACTIVATIONS_MAX = 20;

export const deviceInitialRecordBodySchema = z.strictObject({
  ...deviceCreateBodySchema.shape,
  assetCode: z.string().trim().min(1).max(64).optional(),
  keyActivations: z
    .array(z.strictObject({ licenseKeyId: z.uuid() }))
    .max(INITIAL_KEY_ACTIVATIONS_MAX)
    .refine(
      (items) => new Set(items.map((item) => item.licenseKeyId)).size === items.length,
      'keyActivations licenseKeyId must be unique',
    )
    .optional(),
});

export class DeviceInitialRecordBodyDto extends createZodDto(deviceInitialRecordBodySchema) {}
