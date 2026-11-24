import { z } from 'zod';
import { createZodDto } from '../../../infrastructure/http/dto/zod-dto';

const text = (max: number) => z.string().trim().min(1).max(max);

export const deviceAttributesParamSchema = z.strictObject({ id: z.uuid() });

/**
 * What a person corrects on a machine. The version is required and at least one other field must be named (the rule is judged by the policy and
 * answers with its own code). The asset code is not a field: a machine keeps its code for life, whatever its kind becomes.
 */
export const deviceAttributesBodySchema = z
  .strictObject({
    expectedUpdatedAt: z.iso.datetime().meta({ description: 'The updatedAt of the machine as the caller read it.' }),
    hostname: text(63).optional(),
    os: text(60).optional(),
    serialNumber: text(100).nullable().optional().meta({
      description: 'The serial number of the machine; null takes it away. One serial number belongs to one machine.',
    }),
    deviceType: z.enum(['LAP', 'PC', 'OTH']).optional().meta({
      description: 'The kind of machine: a laptop, a desktop or another. The asset code does not change with it.',
    }),
  })
  .meta({
    // The version plus at least one field: told to the reader of the contract, judged by the policy (DEVICE.UPDATE_EMPTY).
    minProperties: 2,
    description: 'The version of the machine and at least one field to correct.',
  });

export class DeviceAttributesParamDto extends createZodDto(deviceAttributesParamSchema) {}
export class DeviceAttributesBodyDto extends createZodDto(deviceAttributesBodySchema) {}
