import { z } from 'zod';
import { successEnvelopeSchema } from '../../../infrastructure/http/dto/success-envelope.dto';
import { createZodDto } from '../../../infrastructure/http/dto/zod-dto';

/**
 * The catalog as a person who asks for software reads it. Only what helps them pick is on the wire: no responsible IT Admin, price,
 * amount, subscription, contract, seat count, key or workspace. Whether the department can price a plan is a status, never a
 * figure: the amount is the preview's to show.
 */
const kind = z.enum(['SAAS', 'LICENSED', 'INTERNAL']);
const page = z.coerce.number().int().positive().default(1);
const pageSize = z.coerce.number().int().positive().max(100).default(20);
const search = z.string().max(100).optional();

export const listRequestableApplicationsQuerySchema = z.strictObject({
  search: search.meta({
    description: 'Part of the name of the application or of its vendor, ignoring case and accents.',
  }),
  kind: kind.optional(),
  functionalGroupId: z.uuid().optional(),
  page,
  pageSize,
});

export const listRequestablePlansQuerySchema = z.strictObject({
  search: search.meta({
    description: 'Part of the name of the plan or of its application, ignoring case and accents.',
  }),
  kind: kind.optional().meta({ description: 'The kind of the application of the plan.' }),
  applicationId: z.uuid().optional(),
  page,
  pageSize,
});

export const requestableIdParamSchema = z.strictObject({ id: z.uuid() });

const submission = {
  costsMoney: z
    .boolean()
    .meta({ description: 'Paid and licensed software is requested with an amount; internal software is free.' }),
  canSubmit: z.boolean().meta({
    description: 'Whether a request for it can be sent today; when false it can still be picked and kept as a draft.',
  }),
  submitBlockedReason: z
    .enum(['FINANCE_SETUP_INCOMPLETE'])
    .nullable()
    .meta({ description: 'Why it cannot be sent: the department of the caller has no Cost Center in use yet.' }),
};

const pagination = z.strictObject({
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  totalItems: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
});

/** A row of the list; the detail is this and the rest, so the shared fields cannot drift apart. */
const requestableApplicationSummarySchema = z.strictObject({
  id: z.uuid(),
  name: z.string(),
  kind,
  vendorName: z.string().nullable(),
  functionalGroup: z.strictObject({ id: z.uuid(), name: z.string() }).nullable(),
  planCount: z.number().int().positive(),
  ...submission,
});
const requestableApplicationDetailSchema = requestableApplicationSummarySchema.extend({
  dataSensitivity: z.enum(['LOW', 'MEDIUM', 'HIGH']),
});

const requestablePlanSummarySchema = z.strictObject({
  id: z.uuid(),
  name: z.string(),
  provisioningType: z.enum(['K1', 'K2', 'K3', 'K4', 'K5']),
  application: z.strictObject({ id: z.uuid(), name: z.string(), kind }),
  price: z
    .strictObject({
      status: z.enum(['PRICED', 'MISSING', 'NOT_APPLICABLE']),
      missingReason: z.enum(['NO_PRICED_SUBSCRIPTION', 'CYCLE_UNKNOWN']).nullable(),
    })
    .meta({
      description:
        'Whether the department of the caller can price the plan, never the price itself. A missing price does not stop the request: the preview says it cannot go on to the spend step until the plan is priced.',
    }),
  ...submission,
});
const requestablePlanDetailSchema = requestablePlanSummarySchema.extend({
  vendorName: z.string().nullable(),
  sharingPolicy: z.enum(['ALLOWED', 'NOT_ALLOWED']).nullable(),
  dataLossOnRemoval: z.boolean(),
});

export class ListRequestableApplicationsQueryDto extends createZodDto(listRequestableApplicationsQuerySchema) {}
export class ListRequestablePlansQueryDto extends createZodDto(listRequestablePlansQuerySchema) {}
export class RequestableIdParamDto extends createZodDto(requestableIdParamSchema) {}
export class RequestableApplicationPageResponseDto extends createZodDto(
  successEnvelopeSchema(z.strictObject({ items: z.array(requestableApplicationSummarySchema), pagination })),
) {}
export class RequestableApplicationResponseDto extends createZodDto(
  successEnvelopeSchema(requestableApplicationDetailSchema),
) {}
export class RequestablePlanPageResponseDto extends createZodDto(
  successEnvelopeSchema(z.strictObject({ items: z.array(requestablePlanSummarySchema), pagination })),
) {}
export class RequestablePlanResponseDto extends createZodDto(successEnvelopeSchema(requestablePlanDetailSchema)) {}
