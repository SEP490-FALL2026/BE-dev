import { z } from 'zod';
import { successEnvelopeSchema } from '../../../../infrastructure/http/dto/success-envelope.dto';
import { createZodDto } from '../../../../infrastructure/http/dto/zod-dto';

export const rotationBodySchema = z.strictObject({});

const instant = z.iso.datetime();

export const deviceSessionSchema = z.strictObject({
  state: z.enum(['ACTIVE', 'AWAITING_ACKNOWLEDGEMENT', 'COLLECTION_STOPPED']),
  expiresAt: instant,
  timezone: z.string(),
  acceptFromAt: instant.nullable(),
  acceptUntilAt: instant.nullable(),
  allowlist: z.strictObject({
    version: z
      .number()
      .int()
      .positive()
      .nullable()
      .meta({ description: 'The version in force; null while none is published.' }),
    entries: z.array(z.strictObject({ kind: z.enum(['AI_TOOL']), key: z.string() })).max(3),
  }),
});

export const issuedCredentialSchema = z.strictObject({ token: z.string(), expiresAt: instant });

export class RotationBodyDto extends createZodDto(rotationBodySchema) {}
export class DeviceSessionResponseDto extends createZodDto(successEnvelopeSchema(deviceSessionSchema)) {}
export class IssuedCredentialResponseDto extends createZodDto(successEnvelopeSchema(issuedCredentialSchema)) {}
