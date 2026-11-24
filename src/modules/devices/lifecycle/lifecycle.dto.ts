import { z } from 'zod';
import { successEnvelopeSchema } from '../../../infrastructure/http/dto/success-envelope.dto';
import { createZodDto } from '../../../infrastructure/http/dto/zod-dto';
import { DEVICE_CONDITIONS } from '../devices-custody.policy';
import { deviceDetailSchema } from '../registry/registry.dto';

const uniqueActivationIds = (items: readonly { activationId: string }[]) =>
  new Set(items.map((item) => item.activationId)).size === items.length;

export const softwareRemovalSchema = z.strictObject({
  outcome: z.enum(['REMOVED', 'NOT_REMOVABLE']),
  note: z.string().max(1000).optional(),
});

export const holderChangeBodySchema = z.strictObject({
  holderEmployeeId: z.uuid(),
  collectorInstalled: z.boolean(),
  softwareRemoval: softwareRemovalSchema.optional(),
});

export const deviceReturnBodySchema = z.strictObject({
  condition: z.enum(DEVICE_CONDITIONS),
  conditionNote: z.string().trim().min(1).max(1000).optional(),
  softwareRemoval: softwareRemovalSchema,
});

export const conditionChangeBodySchema = z.strictObject({
  condition: z.enum(DEVICE_CONDITIONS),
  note: z.string().trim().min(1).max(1000).optional(),
});

export const retirementBodySchema = z.strictObject({
  retirementKind: z.enum(['DISPOSED', 'LOST']).optional().default('DISPOSED'),
  reason: z.string().trim().min(1).max(1000),
  activationDecisions: z
    .array(
      z.strictObject({
        activationId: z.uuid(),
        licenseRelease: z.enum(['RETURN_TO_LOT', 'LOST_WITH_DEVICE']),
      }),
    )
    .max(50)
    .refine(uniqueActivationIds, 'activationDecisions must name each activation once')
    .optional(),
});

export const deviceReplacementBodySchema = z.strictObject({
  replacementDeviceId: z.uuid(),
  condition: z.enum(DEVICE_CONDITIONS),
  conditionNote: z.string().trim().min(1).max(1000).optional(),
  softwareRemoval: softwareRemovalSchema,
  collectorInstalled: z.boolean(),
  activations: z
    .array(
      z.strictObject({
        activationId: z.uuid(),
        action: z.enum(['MOVE', 'STAY']),
      }),
    )
    .max(50)
    .refine(uniqueActivationIds, 'activations must name each activation once')
    .optional(),
});

export const deviceReplacementResponseSchema = successEnvelopeSchema(
  z.strictObject({
    returnedDeviceId: z.uuid(),
    replacementDevice: deviceDetailSchema,
    movedActivations: z.array(
      z.strictObject({
        activationId: z.uuid(),
        overActivationCap: z.boolean(),
      }),
    ),
  }),
);

export const deviceVoidBodySchema = z.strictObject({
  reason: z.string().trim().min(1).max(1000),
});

export class HolderChangeBodyDto extends createZodDto(holderChangeBodySchema) {}
export class DeviceReturnBodyDto extends createZodDto(deviceReturnBodySchema) {}
export class ConditionChangeBodyDto extends createZodDto(conditionChangeBodySchema) {}
export class RetirementBodyDto extends createZodDto(retirementBodySchema) {}
export class DeviceReplacementBodyDto extends createZodDto(deviceReplacementBodySchema) {}
export class DeviceReplacementResponseDto extends createZodDto(deviceReplacementResponseSchema) {}
export class DeviceVoidBodyDto extends createZodDto(deviceVoidBodySchema) {}
