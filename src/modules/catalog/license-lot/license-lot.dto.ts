import { z } from 'zod';
import { responseBusinessDate } from '../../../infrastructure/http/dto/business-date.dto';
import { successEnvelopeSchema } from '../../../infrastructure/http/dto/success-envelope.dto';
import { createZodDto } from '../../../infrastructure/http/dto/zod-dto';

const money = z.strictObject({ amount: z.string().max(40), currency: z.string().regex(/^[A-Z]{3}$/) });
const unitPrice = money.meta({
  description:
    'The price of one license before tax, in dong: a decimal string in major units, currency VND. Another currency is refused.',
});
const purpose = z.enum(['OPENING', 'REQUEST', 'REPLACEMENT', 'STOCK']);
const keyBinding = z.enum(['ACCOUNT', 'DEVICE_KEY', 'DEVICE_BUNDLED']);
const version = z.iso
  .datetime({ offset: true })
  .meta({ description: 'The updatedAt of the lot as the caller read it.' });
const text = (max: number) => z.string().trim().min(1).max(max);

export const licenseLotIdParamSchema = z.strictObject({ id: z.uuid() });

export const listLicenseLotsQuerySchema = z.strictObject({
  planId: z.uuid().optional().meta({ description: 'Only the lots of this plan.' }),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});

export const updateLicenseLotBodySchema = z
  .strictObject({
    contractId: z.uuid().nullable().optional(),
    contractChangeReason: text(500).optional().meta({
      description: 'Why the contract of the lot changes; needed when it leaves a contract for another or for none.',
    }),
    note: text(1000).nullable().optional(),
    unitPrice: unitPrice.optional().meta({
      description:
        'The price of one license; changed only while no key of the lot was given and no invoice of it was confirmed.',
    }),
    expectedUpdatedAt: version,
  })
  .refine((body) => body.contractId !== undefined || body.note !== undefined || body.unitPrice !== undefined, {
    message: 'Send at least one thing to change.',
  });

export const changeLicenseLotResponsibleBodySchema = z.strictObject({
  employeeId: z.uuid(),
  reason: text(500),
});

const lotSchema = z.strictObject({
  id: z.uuid(),
  plan: z.strictObject({ id: z.uuid(), name: z.string(), keyBinding: keyBinding.nullable() }),
  purchasedOn: responseBusinessDate,
  licenseCount: z.number().int(),
  assigned: z.number().int().nonnegative().meta({
    description: 'The licenses taken: keys given to people, machines the key is on, and old rights with no key.',
  }),
  free: z.number().int().nonnegative(),
  keysInStore: z.number().int().nonnegative(),
  grantable: z.number().int().nonnegative().nullable().meta({
    description:
      'The keys that can be given at once: the licenses free and the keys in the store, whichever is the fewer; null for a plan whose key goes on a machine.',
  }),
  unitPrice: money,
  freeValue: money.meta({ description: 'What the licenses still free are worth: free times the unit price.' }),
  purpose,
  contract: z.strictObject({ id: z.uuid(), name: z.string() }).nullable(),
  workspace: z.strictObject({ id: z.uuid(), name: z.string() }).nullable(),
  responsibleItAdminEmployeeId: z.uuid().nullable(),
  updatedAt: z.iso.datetime(),
});

const lotDetailSchema = lotSchema.extend({
  note: z.string().nullable(),
  requestId: z.uuid().nullable(),
  invoiceActual: money
    .nullable()
    .meta({ description: 'What Finance confirmed the invoice of the lot at; null before.' }),
  originalUnitPrice: money.nullable(),
});

const lotChangeSchema = z.strictObject({
  lot: lotDetailSchema,
  changed: z
    .boolean()
    .meta({ description: 'False when the IT Admin named already answers for the lot: nothing was written.' }),
});

export class LicenseLotIdParamDto extends createZodDto(licenseLotIdParamSchema) {}
export class ListLicenseLotsQueryDto extends createZodDto(listLicenseLotsQuerySchema) {}
export class UpdateLicenseLotBodyDto extends createZodDto(updateLicenseLotBodySchema) {}
export class ChangeLicenseLotResponsibleBodyDto extends createZodDto(changeLicenseLotResponsibleBodySchema) {}
export class LicenseLotDetailResponseDto extends createZodDto(successEnvelopeSchema(lotDetailSchema)) {}
export class LicenseLotChangeResponseDto extends createZodDto(successEnvelopeSchema(lotChangeSchema)) {}
export class LicenseLotPageResponseDto extends createZodDto(
  successEnvelopeSchema(
    z.strictObject({
      items: z.array(lotSchema),
      pagination: z.strictObject({
        page: z.number().int().positive(),
        pageSize: z.number().int().positive(),
        totalItems: z.number().int().nonnegative(),
        totalPages: z.number().int().nonnegative(),
      }),
    }),
  ),
) {}

export type LicenseLotWire = z.infer<typeof lotDetailSchema>;
