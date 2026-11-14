import { z } from 'zod';
import { businessDateSchema, responseBusinessDate } from '../../../infrastructure/http/dto/business-date.dto';
import { successEnvelopeSchema } from '../../../infrastructure/http/dto/success-envelope.dto';
import { createZodDto } from '../../../infrastructure/http/dto/zod-dto';
import { COLLECTION_STATES } from '../devices-collection-state.policy';

const text = (max: number) => z.string().trim().min(1).max(max);

export const deviceCreateBodySchema = z.strictObject({
  assetCode: text(60).meta({
    description: 'The asset tag; the same code in another case or with other blanks is the same machine.',
  }),
  hostname: text(63),
  os: text(60),
  holderEmployeeId: z.uuid(),
  handedOverOn: businessDateSchema(
    'handedOverOn must be a date',
    'The day the machine was handed over as YYYY-MM-DD; it must exist, and it is not after today nor before the holder was hired. Today when omitted.',
  ).optional(),
});
export const holderChangeBodySchema = z.strictObject({ holderEmployeeId: z.uuid() });
export const retirementBodySchema = z.strictObject({ reason: text(1000) });
export const signatureRecordBodySchema = z.strictObject({ documentId: z.uuid(), noticeVersionId: z.uuid() });
export const deviceIdParamSchema = z.strictObject({ id: z.uuid() });

export const deviceListQuerySchema = z.strictObject({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: text(100)
    .meta({ description: 'Matches the asset code and the hostname, ignoring case and accents.' })
    .optional(),
  holderEmployeeId: z.uuid().optional(),
  state: z.enum(COLLECTION_STATES).optional(),
});

const holderSchema = z.strictObject({ id: z.uuid(), employeeCode: z.string(), fullName: z.string() });
const instant = z.iso.datetime();

export const deviceSummarySchema = z.strictObject({
  id: z.uuid(),
  assetCode: z.string(),
  hostname: z.string(),
  os: z.string(),
  holder: holderSchema.nullable(),
  registrationId: z.uuid().nullable(),
  registeredFrom: responseBusinessDate.nullable(),
  state: z.enum(COLLECTION_STATES),
  signatureRecorded: z.boolean(),
  retiredAt: instant.nullable(),
});

export const deviceDetailSchema = deviceSummarySchema.extend({
  acknowledgedFrom: instant.nullable(),
  latestAcknowledgement: z.strictObject({ noticeVersionNumber: z.number().int(), acknowledgedAt: instant }).nullable(),
  latestSignatureRecord: z
    .strictObject({ id: z.uuid(), documentId: z.uuid(), noticeVersionNumber: z.number().int(), recordedAt: instant })
    .nullable(),
  lastEnd: z
    .strictObject({
      holder: holderSchema,
      validUntil: responseBusinessDate,
      endedAt: instant,
      endCause: z.enum(['HOLDER_CHANGED', 'DEVICE_RETIRED', 'DEPARTURE', 'EMPLOYEE_LEFT', 'DEPARTURE_BLOCKED']),
    })
    .nullable(),
  retirementReason: z.string().nullable(),
});

export const signatureRecordSchema = z.strictObject({
  id: z.uuid(),
  registrationId: z.uuid(),
  documentId: z.uuid(),
  noticeVersionNumber: z.number().int(),
  recordedAt: instant,
});

export class DeviceCreateBodyDto extends createZodDto(deviceCreateBodySchema) {}
export class HolderChangeBodyDto extends createZodDto(holderChangeBodySchema) {}
export class RetirementBodyDto extends createZodDto(retirementBodySchema) {}
export class SignatureRecordBodyDto extends createZodDto(signatureRecordBodySchema) {}
export class DeviceIdParamDto extends createZodDto(deviceIdParamSchema) {}
export class DeviceListQueryDto extends createZodDto(deviceListQuerySchema) {}
export class DeviceDetailResponseDto extends createZodDto(successEnvelopeSchema(deviceDetailSchema)) {}
export class SignatureRecordResponseDto extends createZodDto(successEnvelopeSchema(signatureRecordSchema)) {}
export class DevicePageResponseDto extends createZodDto(
  successEnvelopeSchema(
    z.strictObject({
      items: z.array(deviceSummarySchema),
      pagination: z.strictObject({
        page: z.number().int().positive(),
        pageSize: z.number().int().positive(),
        totalItems: z.number().int().nonnegative(),
        totalPages: z.number().int().nonnegative(),
      }),
    }),
  ),
) {}
