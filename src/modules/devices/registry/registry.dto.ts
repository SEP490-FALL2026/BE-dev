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

export const deviceRegistrationListQuerySchema = z.strictObject({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

const holderSchema = z.strictObject({ id: z.uuid(), employeeCode: z.string(), fullName: z.string() });
const instant = z.iso.datetime();
const END_CAUSES = ['HOLDER_CHANGED', 'DEVICE_RETIRED', 'DEPARTURE', 'EMPLOYEE_LEFT', 'DEPARTURE_BLOCKED'] as const;
const pagination = z.strictObject({
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  totalItems: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
});

/** What the list says of whether the machine is being collected from: the state, and the last time an intake from it was accepted. */
const collectionSchema = z.strictObject({
  state: z.enum(COLLECTION_STATES),
  lastAcceptedAt: instant.nullable().meta({
    description:
      'The latest instant any credential of the open registration was accepted (usage or tool status); null while nothing was and for a machine nobody holds. State ACTIVE alone only says the holder acknowledged the notice.',
  }),
});

export const deviceSummarySchema = z.strictObject({
  id: z.uuid(),
  assetCode: z.string(),
  hostname: z.string(),
  os: z.string(),
  holder: holderSchema.nullable(),
  registrationId: z.uuid().nullable(),
  registeredFrom: responseBusinessDate.nullable(),
  state: z.enum(COLLECTION_STATES),
  collection: collectionSchema,
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
      endCause: z.enum(END_CAUSES),
    })
    .nullable(),
  retirementReason: z.string().nullable(),
});

/** One registration of a machine in its history: the holder, the days, how it ended, and where acknowledgement and collection stand. */
export const deviceRegistrationSchema = z.strictObject({
  id: z.uuid(),
  holder: holderSchema.nullable().meta({ description: 'Null only when the person record can no longer be read.' }),
  validFrom: responseBusinessDate,
  validUntil: responseBusinessDate
    .nullable()
    .meta({ description: 'The last day of the registration; null while it is open.' }),
  endedAt: instant.nullable(),
  endCause: z.enum(END_CAUSES).nullable(),
  acknowledgedFrom: instant.nullable(),
  collectionStoppedAt: instant.nullable(),
  signatureRecorded: z.boolean(),
  lastAcceptedAt: instant
    .nullable()
    .meta({ description: 'The latest instant any credential of this registration was accepted.' }),
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
export class DeviceRegistrationListQueryDto extends createZodDto(deviceRegistrationListQuerySchema) {}
export class DeviceDetailResponseDto extends createZodDto(successEnvelopeSchema(deviceDetailSchema)) {}
export class SignatureRecordResponseDto extends createZodDto(successEnvelopeSchema(signatureRecordSchema)) {}
export class DevicePageResponseDto extends createZodDto(
  successEnvelopeSchema(
    z.strictObject({
      items: z.array(deviceSummarySchema),
      pagination,
    }),
  ),
) {}
export class DeviceRegistrationPageResponseDto extends createZodDto(
  successEnvelopeSchema(z.strictObject({ items: z.array(deviceRegistrationSchema), pagination })),
) {}
