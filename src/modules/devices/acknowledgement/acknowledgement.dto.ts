import { z } from 'zod';
import { successEnvelopeSchema } from '../../../infrastructure/http/dto/success-envelope.dto';
import { createZodDto } from '../../../infrastructure/http/dto/zod-dto';

export const acknowledgementBodySchema = z.strictObject({
  noticeVersionId: z
    .uuid()
    .meta({ description: 'The id of the version of the notice in force, as the holder read it.' }),
});
export const registrationIdParamSchema = z.strictObject({ id: z.uuid() });

export const acknowledgementSchema = z.strictObject({
  id: z.uuid(),
  registrationId: z.uuid(),
  noticeVersionNumber: z.number().int().positive(),
  acknowledgedAt: z.iso.datetime(),
});

export class AcknowledgementBodyDto extends createZodDto(acknowledgementBodySchema) {}
export class RegistrationIdParamDto extends createZodDto(registrationIdParamSchema) {}
export class AcknowledgementResponseDto extends createZodDto(successEnvelopeSchema(acknowledgementSchema)) {}
