import { z } from 'zod';
import { successEnvelopeSchema } from '../../../infrastructure/http/dto/success-envelope.dto';
import { createZodDto } from '../../../infrastructure/http/dto/zod-dto';

export const STOP_REQUEST_STATES = ['OPEN', 'COMPLETED', 'INVALID'] as const;

export const stopRequestBodySchema = z.strictObject({});
export const stopRequestIdParamSchema = z.strictObject({ id: z.uuid() });
export const stopRequestListQuerySchema = z.strictObject({
  state: z
    .enum(STOP_REQUEST_STATES)
    .default('OPEN')
    .meta({ description: 'The state of the requests to list; OPEN when omitted.' }),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

const instant = z.iso.datetime();
export const stopRequestSchema = z.strictObject({
  id: z.uuid(),
  registrationId: z.uuid(),
  deviceId: z.uuid(),
  holderEmployeeId: z.uuid(),
  state: z.enum(STOP_REQUEST_STATES),
  invalidReason: z.enum(['DUPLICATE', 'ALREADY_STOPPED', 'REGISTRATION_ENDED', 'IT_ADMIN']).nullable().meta({
    description:
      'Why the system closed the request as invalid: another request was open (DUPLICATE), collection was stopped already (ALREADY_STOPPED) or the registration ended (REGISTRATION_ENDED); null otherwise. IT_ADMIN is never given.',
  }),
  requestedAt: instant,
  dueAt: instant.meta({ description: 'Two working days after the request was received, at the same time of day.' }),
  handledAt: instant.nullable(),
  handledByAppUserId: z.uuid().nullable(),
  selfHandled: z.boolean().meta({ description: 'The IT Admin who completed the request is the holder who asked.' }),
  overdue: z.boolean().meta({ description: 'The request is still open and its deadline has passed.' }),
});
const pagination = z.strictObject({
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  totalItems: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
});

export class StopRequestBodyDto extends createZodDto(stopRequestBodySchema) {}
export class StopRequestIdParamDto extends createZodDto(stopRequestIdParamSchema) {}
export class StopRequestListQueryDto extends createZodDto(stopRequestListQuerySchema) {}
export class StopRequestResponseDto extends createZodDto(
  successEnvelopeSchema(z.strictObject({ stopRequest: stopRequestSchema })),
) {}
export class StopRequestPageResponseDto extends createZodDto(
  successEnvelopeSchema(z.strictObject({ items: z.array(stopRequestSchema), pagination })),
) {}
