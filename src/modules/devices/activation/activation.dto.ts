import { z } from 'zod';
import { responseBusinessDate } from '../../../infrastructure/http/dto/business-date.dto';
import { successEnvelopeSchema } from '../../../infrastructure/http/dto/success-envelope.dto';
import { createZodDto } from '../../../infrastructure/http/dto/zod-dto';

const instant = z.iso.datetime();

export const DEVICE_ACTIVATION_ORIGINS = ['OPERATION', 'INITIAL'] as const;
export const DEVICE_ACTIVATION_END_CAUSES = [
  'DEACTIVATED',
  'MOVED',
  'DEVICE_DISPOSED',
  'DEVICE_LOST',
  'DEVICE_VOIDED',
] as const;

export const openDeviceActivationBodySchema = z.strictObject({
  planId: z.uuid(),
  licenseKeyId: z.uuid().optional(),
});

export const deviceActivationSchema = z.strictObject({
  id: z.uuid(),
  deviceId: z.uuid(),
  planId: z.uuid(),
  licenseKeyId: z.uuid().nullable(),
  subscriptionId: z.uuid().nullable(),
  keyMasked: z.string().nullable(),
  keyWithdrawn: z.boolean(),
  origin: z.enum(DEVICE_ACTIVATION_ORIGINS),
  movedFromActivationId: z.uuid().nullable(),
  activatedOn: responseBusinessDate,
  activatedAt: instant,
  overActivationCap: z.boolean(),
  deactivatedOn: responseBusinessDate.nullable(),
  deactivatedAt: instant.nullable(),
  endCause: z.enum(DEVICE_ACTIVATION_END_CAUSES).nullable(),
  licenseReleased: z.boolean().nullable(),
});

export const openedDeviceActivationSchema = z.strictObject({
  activation: deviceActivationSchema,
  activationsUsed: z.number().int().min(0).nullable(),
  maxActivations: z.number().int().min(1).nullable(),
  overActivationCap: z.boolean(),
});

export class OpenDeviceActivationBodyDto extends createZodDto(openDeviceActivationBodySchema) {}
export class OpenedDeviceActivationResponseDto extends createZodDto(
  successEnvelopeSchema(openedDeviceActivationSchema),
) {}
