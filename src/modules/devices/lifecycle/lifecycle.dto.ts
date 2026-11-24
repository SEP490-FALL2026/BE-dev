import { z } from 'zod';
import { createZodDto } from '../../../infrastructure/http/dto/zod-dto';
import { DEVICE_CONDITIONS } from '../devices-custody.policy';

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
  reason: z.string().trim().min(1).max(1000),
});

export class HolderChangeBodyDto extends createZodDto(holderChangeBodySchema) {}
export class DeviceReturnBodyDto extends createZodDto(deviceReturnBodySchema) {}
export class ConditionChangeBodyDto extends createZodDto(conditionChangeBodySchema) {}
export class RetirementBodyDto extends createZodDto(retirementBodySchema) {}
