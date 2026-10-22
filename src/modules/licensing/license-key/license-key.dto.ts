import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { successEnvelopeSchema } from '../../../infrastructure/http/dto/success-envelope.dto';
import { MAX_KEYS_PER_BATCH } from './license-key.policy';

/**
 * Only the shape and a bound are checked here: whether a key has the form of a license key, is repeated or is already
 * kept is judged line by line by the policy and the vault, and answers with the line and a code, never with the key.
 */
export const importBodySchema = z.strictObject({
  subscriptionId: z.uuid(),
  keys: z.array(z.string().max(512)).min(1).max(MAX_KEYS_PER_BATCH),
});

const STATUSES = ['IN_STORE', 'ASSIGNED', 'RETIRED'] as const;
export const listQuerySchema = z.strictObject({
  subscriptionId: z.uuid(),
  status: z.enum(STATUSES).optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});
export const keyIdParamSchema = z.strictObject({ id: z.uuid() });

const summarySchema = z.strictObject({
  purchased: z.number().int().nonnegative().nullable(),
  usableKeys: z.number().int().nonnegative(),
  capacity: z.number().int().nonnegative(),
  warning: z.enum(['KEY_COUNT_DIFFERS', 'QUANTITY_UNKNOWN']).nullable(),
});
const pagination = z.strictObject({
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  totalItems: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
});

export class ImportBodyDto extends createZodDto(importBodySchema) {}
export class ListKeysQueryDto extends createZodDto(listQuerySchema) {}
export class KeyIdParamDto extends createZodDto(keyIdParamSchema) {}
export class ImportResponseDto extends createZodDto(
  successEnvelopeSchema(
    z.strictObject({
      imported: z.number().int().nonnegative(),
      errors: z.array(
        z.strictObject({
          line: z.number().int().positive(),
          code: z.enum(['INVALID_FORMAT', 'DUPLICATE_IN_BATCH', 'ALREADY_IN_STORE']),
        }),
      ),
      summary: summarySchema,
    }),
  ),
) {}
export class KeyPageResponseDto extends createZodDto(
  successEnvelopeSchema(
    z.strictObject({
      items: z.array(
        z.strictObject({
          id: z.uuid(),
          subscriptionId: z.uuid(),
          masked: z.string(),
          status: z.enum(STATUSES),
          importedAt: z.iso.datetime(),
        }),
      ),
      pagination,
      summary: summarySchema,
    }),
  ),
) {}
export class RevealResponseDto extends createZodDto(
  successEnvelopeSchema(z.strictObject({ id: z.uuid(), value: z.string() })),
) {}
