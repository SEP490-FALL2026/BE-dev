import { z } from 'zod';
import { responseBusinessDate } from '../../../infrastructure/http/dto/business-date.dto';
import { successEnvelopeSchema } from '../../../infrastructure/http/dto/success-envelope.dto';
import { createZodDto } from '../../../infrastructure/http/dto/zod-dto';
import { DEVICE_CONDITIONS, DEVICE_CUSTODIES } from '../devices-custody.policy';

const instant = z.iso.datetime();
const booleanQueryFlag = z.enum(['true', 'false']).transform((value) => value === 'true');
const pagination = z.strictObject({
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  totalItems: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
});

export const DEVICE_ACTIVATION_ORIGINS = ['OPERATION', 'INITIAL'] as const;
export const DEVICE_ACTIVATION_END_CAUSES = [
  'DEACTIVATED',
  'MOVED',
  'DEVICE_DISPOSED',
  'DEVICE_LOST',
  'DEVICE_VOIDED',
] as const;
export const DEVICE_LICENSE_RELEASES = ['RETURN_TO_LOT', 'LOST_WITH_DEVICE'] as const;

export const activationIdParamSchema = z.strictObject({ id: z.uuid() });

export const openDeviceActivationBodySchema = z.strictObject({
  planId: z.uuid(),
  licenseKeyId: z.uuid().optional(),
});

export const deactivateDeviceActivationBodySchema = z.strictObject({
  licenseRelease: z.enum(DEVICE_LICENSE_RELEASES).optional(),
});

export const moveDeviceActivationBodySchema = z.strictObject({
  targetDeviceId: z.uuid(),
});

export const deviceActivationListQuerySchema = z.strictObject({
  deviceId: z.uuid().optional(),
  planId: z.uuid().optional(),
  licenseKeyId: z.uuid().optional(),
  state: z.enum(['OPEN', 'CLOSED', 'ALL']).default('OPEN'),
  idleDevice: booleanQueryFlag.optional(),
  needsKeyReplacement: booleanQueryFlag.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
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

export const deviceActivationListItemSchema = z.strictObject({
  id: z.uuid(),
  device: z.strictObject({
    id: z.uuid(),
    assetCode: z.string(),
    custody: z.enum(DEVICE_CUSTODIES),
    condition: z.enum(DEVICE_CONDITIONS),
  }),
  plan: z.strictObject({
    id: z.uuid(),
    name: z.string(),
    keyBinding: z.enum(['DEVICE_KEY', 'DEVICE_BUNDLED']),
  }),
  application: z.strictObject({
    id: z.uuid(),
    name: z.string(),
  }),
  licenseKey: z
    .strictObject({
      id: z.uuid(),
      masked: z.string(),
      withdrawn: z.boolean(),
    })
    .nullable(),
  lotId: z.uuid().nullable(),
  origin: z.enum(DEVICE_ACTIVATION_ORIGINS),
  activatedOn: responseBusinessDate,
  deactivatedOn: responseBusinessDate.nullable(),
  endCause: z.enum(DEVICE_ACTIVATION_END_CAUSES).nullable(),
  licenseReleased: z.boolean().nullable(),
  overActivationCap: z.boolean(),
  needsKeyReplacement: z.boolean(),
});

export class ActivationIdParamDto extends createZodDto(activationIdParamSchema) {}
export class OpenDeviceActivationBodyDto extends createZodDto(openDeviceActivationBodySchema) {}
export class DeactivateDeviceActivationBodyDto extends createZodDto(deactivateDeviceActivationBodySchema) {}
export class MoveDeviceActivationBodyDto extends createZodDto(moveDeviceActivationBodySchema) {}
export class DeviceActivationListQueryDto extends createZodDto(deviceActivationListQuerySchema) {}
export class DeviceActivationResponseDto extends createZodDto(successEnvelopeSchema(deviceActivationSchema)) {}
export class OpenedDeviceActivationResponseDto extends createZodDto(
  successEnvelopeSchema(openedDeviceActivationSchema),
) {}
export class DeviceActivationPageResponseDto extends createZodDto(
  successEnvelopeSchema(z.strictObject({ items: z.array(deviceActivationListItemSchema), pagination })),
) {}
