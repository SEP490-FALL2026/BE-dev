import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { successEnvelopeSchema } from '../../../infrastructure/http/dto/success-envelope.dto';

/**
 * Only the shape and a generous bound are checked here. Whether a name is empty or too long, a domain is a host, a
 * list holds more than twenty domains or the note is over 1000 characters is judged by the policy and answers with its
 * own `APPLICATION.*` code. The kind `FREE_EXTERNAL` is accepted here on purpose: it is refused as a business rule.
 */
const text = z.string().max(1000);
const textList = z.array(z.string().max(1000)).max(100);
const note = z.string().max(5000);
const sensitivity = z.enum(['LOW', 'MEDIUM', 'HIGH']);
const kind = z.enum(['SAAS', 'LICENSED', 'INTERNAL']);

export const declareApplicationBodySchema = z.strictObject({
  name: text,
  kind: z.enum(['SAAS', 'LICENSED', 'INTERNAL', 'FREE_EXTERNAL']),
  vendorName: text.optional(),
  dictionaryServiceLineId: z.uuid().optional(),
  domains: textList.optional(),
  dataSensitivity: sensitivity,
  businessOwnerEmployeeId: z.uuid(),
  communication: z.strictObject({
    personToPersonMessaging: z.boolean(),
    callsOrMeetings: z.boolean(),
    mailbox: z.boolean(),
    note: note.optional(),
  }),
  functionalGroupId: z.uuid().optional(),
});

/** The kind and the vendor cannot change: they are not fields here, so naming one is a validation error. */
export const updateApplicationBodySchema = z.strictObject({
  name: text.optional(),
  domains: textList.optional(),
  dataSensitivity: sensitivity.optional(),
  businessOwnerEmployeeId: z.uuid().optional(),
  communication: z
    .strictObject({
      personToPersonMessaging: z.boolean().optional(),
      callsOrMeetings: z.boolean().optional(),
      mailbox: z.boolean().optional(),
      note: note.nullable().optional(),
    })
    .optional(),
  functionalGroupId: z.uuid().nullable().optional(),
  dictionaryServiceLineId: z.uuid().nullable().optional(),
});

export const listApplicationsQuerySchema = z.strictObject({
  search: z.string().max(100).optional(),
  kind: kind.optional(),
  status: z.enum(['APPROVED', 'RETIRED']).optional(),
  functionalGroupId: z.uuid().optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});
export const applicationIdParamSchema = z.strictObject({ id: z.uuid() });

const applicationSchema = z.strictObject({
  id: z.uuid(),
  name: z.string(),
  kind,
  vendor: z.strictObject({ id: z.uuid(), name: z.string() }).nullable(),
  dictionaryServiceLineId: z.uuid().nullable(),
  domains: z.array(z.string()),
  dataSensitivity: sensitivity,
  businessOwner: z.strictObject({
    employeeId: z.uuid(),
    employeeCode: z.string(),
    fullName: z.string(),
    status: z.enum(['ACTIVE', 'TERMINATED']),
  }),
  businessOwnerReplacementRequired: z.boolean(),
  communication: z.strictObject({
    personToPersonMessaging: z.boolean(),
    callsOrMeetings: z.boolean(),
    mailbox: z.boolean(),
    isCommunicationService: z.boolean(),
    note: z.string().nullable(),
  }),
  usageCollectionDefault: z.literal('NOT_COLLECTED').nullable(),
  functionalGroup: z.strictObject({ id: z.uuid(), name: z.string() }).nullable(),
  status: z.enum(['APPROVED', 'RETIRED']),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

const createdApplicationSchema = applicationSchema.extend({ proposedToDictionary: z.boolean() });
const applicationDetailSchema = applicationSchema.extend({
  similarApplications: z.array(z.strictObject({ id: z.uuid(), name: z.string() })),
  recommendations: z.array(
    z.strictObject({
      code: z.enum(['CONSIDER_K2']),
      k1Holders: z.number().int().nonnegative(),
      threshold: z.number().int().positive(),
    }),
  ),
});

export class DeclareApplicationBodyDto extends createZodDto(declareApplicationBodySchema) {}
export class UpdateApplicationBodyDto extends createZodDto(updateApplicationBodySchema) {}
export class ListApplicationsQueryDto extends createZodDto(listApplicationsQuerySchema) {}
export class ApplicationIdParamDto extends createZodDto(applicationIdParamSchema) {}
export class ApplicationResponseDto extends createZodDto(successEnvelopeSchema(applicationSchema)) {}
export class CreatedApplicationResponseDto extends createZodDto(successEnvelopeSchema(createdApplicationSchema)) {}
export class ApplicationDetailResponseDto extends createZodDto(successEnvelopeSchema(applicationDetailSchema)) {}
export class ApplicationPageResponseDto extends createZodDto(
  successEnvelopeSchema(
    z.strictObject({
      items: z.array(applicationSchema),
      pagination: z.strictObject({
        page: z.number().int().positive(),
        pageSize: z.number().int().positive(),
        totalItems: z.number().int().nonnegative(),
        totalPages: z.number().int().nonnegative(),
      }),
      emptyState: z
        .strictObject({
          reason: z.enum(['NO_APPLICATIONS', 'NO_SUBSCRIPTIONS']),
          nextStep: z.strictObject({
            step: z.number().int().min(2).max(3),
            key: z.enum(['APPLICATIONS', 'CONTRACTS_AND_SUBSCRIPTIONS']),
          }),
        })
        .nullable(),
    }),
  ),
) {}
