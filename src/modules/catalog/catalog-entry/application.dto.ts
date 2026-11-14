import { z } from 'zod';
import { successEnvelopeSchema } from '../../../infrastructure/http/dto/success-envelope.dto';
import { createZodDto } from '../../../infrastructure/http/dto/zod-dto';

/**
 * Only the shape and a generous bound are checked here. Whether a name is empty or too long, a domain is a host, a
 * list holds more than twenty domains is judged by the policy and answers with its own `APPLICATION.*` code. There are
 * three managed kinds and no other (`QĐ-82n`): a value outside them is the schema's `VALIDATION_ERROR`, never a business rule
 * of its own. The declaration (`POST /applications`, application and first plan in one command) is `application-intake`'s.
 */
export const text = z.string().max(1000);
export const textList = z.array(z.string().max(1000)).max(100);
export const sensitivity = z.enum(['LOW', 'MEDIUM', 'HIGH']);
const kind = z.enum(['SAAS', 'LICENSED', 'INTERNAL']);

/** The longest link a logo may be: the column and its CHECK say the same. */
export const MAX_LOGO_URL_LENGTH = 500;
const isHttpsLink = (value: string): boolean => {
  try {
    const url = new URL(value);

    return url.protocol === 'https:' && url.hostname !== '';
  } catch {
    return false;
  }
};

/**
 * The logo of an application is a link to an image, pasted by the IT Admin: nothing is uploaded and the server never fetches it. Only `https://`
 * is taken (a link that is not encrypted, a script or a data link is refused as a validation error), at most 500 characters once the blanks at
 * both ends are cut off; the link is kept as written. It points at somebody else's server: it can be broken, and a screen that shows it shows the
 * first letter of the name when the image does not load.
 */
export const logoUrlSchema = z
  .string()
  .trim()
  .max(MAX_LOGO_URL_LENGTH)
  .refine(isHttpsLink, { message: 'The logo is a link that starts with https://' });

/** The kind and the vendor cannot change: they are not fields here, so naming one is a validation error. */
export const updateApplicationBodySchema = z.strictObject({
  name: text.optional(),
  domains: textList.optional(),
  dataSensitivity: sensitivity.nullable().optional(),
  functionalGroupId: z.uuid().optional(),
  logoUrl: logoUrlSchema.nullable().optional().meta({
    description: 'A link to the logo image, https only; left out it stays, null removes it.',
  }),
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

/** A row of the list; the detail is this and the rest, so the shared fields cannot drift apart. */
const applicationSummarySchema = z.strictObject({
  id: z.uuid(),
  name: z.string(),
  kind,
  vendor: z.strictObject({ id: z.uuid(), name: z.string() }).nullable(),
  dataSensitivity: sensitivity.nullable(),
  logoUrl: z.string().nullable().meta({
    description:
      'The https link to the logo image that the IT Admin pasted, or null. The server never checks it: it may be broken, so show the first letter of the name when the image does not load.',
  }),
  isCommunicationService: z.boolean().meta({
    description:
      'True when the application stands in the group Liên lạc (email, chat, meetings): the usage rules never collect it.',
  }),
  responsibleItAdmin: z
    .strictObject({ employeeId: z.uuid(), employeeCode: z.string(), fullName: z.string() })
    .nullable()
    .meta({
      description:
        'The IT Admin who answers for the application (the one who declared it, or who took it over); null when nobody does.',
    }),
  needsResponsible: z.boolean().meta({
    description:
      'True when nobody is responsible, or the one named is no longer a working IT Admin: any IT Admin may take it over with the responsibility transfer.',
  }),
  usageCollectionDefault: z.literal('NOT_COLLECTED').nullable(),
  functionalGroup: z.strictObject({ id: z.uuid(), name: z.string() }),
  status: z.enum(['APPROVED', 'RETIRED']),
  updatedAt: z.iso.datetime(),
});
export const applicationSchema = applicationSummarySchema.extend({
  dictionaryServiceLineId: z.uuid().nullable(),
  domains: z.array(z.string()),
  createdAt: z.iso.datetime(),
});
const applicationDetailSchema = applicationSchema.extend({
  similarApplications: z.array(z.strictObject({ id: z.uuid(), name: z.string() })).max(20),
  similarTotal: z.number().int().nonnegative(),
  recommendations: z.array(
    z.strictObject({
      code: z.enum(['CONSIDER_K2']),
      k1Holders: z.number().int().nonnegative(),
      threshold: z.number().int().positive(),
    }),
  ),
});

export class UpdateApplicationBodyDto extends createZodDto(updateApplicationBodySchema) {}
export class ListApplicationsQueryDto extends createZodDto(listApplicationsQuerySchema) {}
export class ApplicationIdParamDto extends createZodDto(applicationIdParamSchema) {}
export class ApplicationResponseDto extends createZodDto(successEnvelopeSchema(applicationSchema)) {}
export class ApplicationDetailResponseDto extends createZodDto(successEnvelopeSchema(applicationDetailSchema)) {}
export class ApplicationPageResponseDto extends createZodDto(
  successEnvelopeSchema(
    z.strictObject({
      items: z.array(applicationSummarySchema),
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
