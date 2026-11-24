import { z } from 'zod';
import { successEnvelopeSchema } from '../../../infrastructure/http/dto/success-envelope.dto';
import { createZodDto } from '../../../infrastructure/http/dto/zod-dto';

const queryFlag = z.enum(['true', 'false']).transform((value) => value === 'true');

export const stockSummaryQuerySchema = z.strictObject({
  mine: queryFlag.optional().meta({
    description:
      'true counts only the subscriptions the caller answers for as their IT Admin, and lists the plans that have one; false or absent counts every subscription of every plan.',
  }),
  planId: z
    .uuid()
    .optional()
    .meta({ description: 'Only this plan: the stock a grant or a revocation of the plan draws on.' }),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});

/**
 * What a plan holds, by what it gives out and never by the records of its subscriptions (`QĐ-111n`): the seats of a K2 plan, the keys of a K4
 * plan (or its licenses, when its key goes on a machine), the rights of a K1 plan. Counted over the subscriptions a seat can be taken from today.
 */
const stockSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('SEATS'),
    purchased: z.number().int().nonnegative().nullable().meta({
      description:
        'The seats bought; null while a subscription of the plan has no quantity (a flat rate), when the seats are not known.',
    }),
    assigned: z.number().int().nonnegative().meta({
      description:
        'The seats held from today on: the most held on any day, so a seat promised from a later day is not free today. Seats being taken back are counted here too.',
    }),
    free: z.number().int().nonnegative().nullable().meta({
      description:
        'The seats a grant can take without buying, the seats of each subscription less what it holds; null when the seats bought are not known.',
    }),
    revoking: z.number().int().nonnegative().meta({
      description:
        'Of the assigned seats, those held by a right whose revocation is still open: not free until the revocation is completed.',
    }),
  }),
  z.strictObject({
    kind: z.literal('KEYS'),
    inStore: z.number().int().nonnegative().meta({
      description:
        'The keys in the store that were not withdrawn. A grant still in progress has not taken its key yet, so this is not the number of keys a grant can still take.',
    }),
    assigned: z.number().int().nonnegative().meta({ description: 'The keys given to a seat.' }),
    withdrawn: z
      .number()
      .int()
      .nonnegative()
      .meta({ description: 'The keys taken out of the store and never given out again.' }),
  }),
  z.strictObject({
    kind: z.literal('LICENSES'),
    purchased: z.number().int().nonnegative().nullable().meta({
      description:
        'The licenses bought of a K4 plan whose key goes on a machine; null while a purchase of the plan has no quantity. One key can be on many machines, so the keys are not counted.',
    }),
    occupied: z.number().int().nonnegative().meta({
      description:
        'The licenses held on machines: the open activations and the closed ones whose license was lost with the machine.',
    }),
    free: z.number().int().nonnegative().nullable().meta({
      description:
        'The licenses a machine can still take, what each purchase bought less what it holds; null when the licenses bought are not known.',
    }),
  }),
  z.strictObject({
    kind: z.literal('HOLDERS'),
    holders: z.number().int().nonnegative().meta({
      description: 'The personal accounts held today (a right each), a plan that has no free seat to count.',
    }),
  }),
]);

const stockSummaryItemSchema = z.strictObject({
  plan: z.strictObject({
    planId: z.uuid(),
    planName: z.string(),
    provisioningType: z.enum(['K1', 'K2', 'K4']),
    applicationId: z.uuid(),
    applicationName: z.string(),
    logoUrl: z.string().nullable().meta({
      description:
        'The https link to the logo image of the application that the IT Admin pasted, or null. The server never checks it: it may be broken, so show the first letter of the name when the image does not load.',
    }),
  }),
  stock: stockSchema,
});

const pagination = z.strictObject({
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  totalItems: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
});

export class StockSummaryQueryDto extends createZodDto(stockSummaryQuerySchema) {}
export class StockSummaryResponseDto extends createZodDto(
  successEnvelopeSchema(z.strictObject({ items: z.array(stockSummaryItemSchema), pagination })),
) {}

export type StockSummaryItemWire = z.infer<typeof stockSummaryItemSchema>;
