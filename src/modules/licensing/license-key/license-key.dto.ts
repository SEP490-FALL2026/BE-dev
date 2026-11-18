import { z } from 'zod';
import { successEnvelopeSchema } from '../../../infrastructure/http/dto/success-envelope.dto';
import { createZodDto } from '../../../infrastructure/http/dto/zod-dto';
import { MAX_KEYS_PER_BATCH, WITHDRAWAL_REASON_MAX_LENGTH } from './license-key.policy';

/**
 * Only the shape and a bound are checked here: whether a key has the form of a license key, is repeated or is already
 * kept is judged line by line by the policy and the vault, and answers with the line and a code, never with the key.
 */
export const importBodySchema = z.strictObject({
  subscriptionId: z.uuid(),
  keys: z.array(z.string().max(512)).min(1).max(MAX_KEYS_PER_BATCH),
});

/** A key is in the store or assigned (`QĐ-103d`); a withdrawn key stays in the store and is found by `withdrawn` (RETIRED is gone). */
const STATUSES = ['IN_STORE', 'ASSIGNED'] as const;
export const listQuerySchema = z.strictObject({
  subscriptionId: z.uuid(),
  status: z.enum(STATUSES).optional(),
  /** `true`: only the keys withdrawn from the store; `false`: only those that are not. */
  withdrawn: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});
export const keyIdParamSchema = z.strictObject({ id: z.uuid() });
/** Why the IT Admin takes a free key out of the store (`QĐ-103v`, Q-10 B): a note, never the key. */
export const withdrawalBodySchema = z.strictObject({
  reason: z.string().trim().min(1).max(WITHDRAWAL_REASON_MAX_LENGTH),
});

const keySchema = z.strictObject({
  id: z.uuid(),
  subscriptionId: z.uuid(),
  masked: z.string(),
  status: z.enum(STATUSES),
  importedAt: z.iso.datetime(),
  /** The seat the key is given to while it is assigned. */
  assignmentId: z.uuid().nullable(),
  /** When the key was withdrawn from the store, and why: a withdrawn key is never given out again. */
  withdrawnAt: z.iso.datetime().nullable(),
  withdrawalReason: z.string().nullable(),
});

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
export class WithdrawalBodyDto extends createZodDto(withdrawalBodySchema) {}
export class KeyResponseDto extends createZodDto(successEnvelopeSchema(z.strictObject({ key: keySchema }))) {}
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
      items: z.array(keySchema),
      pagination,
      summary: summarySchema,
    }),
  ),
) {}
export class RevealResponseDto extends createZodDto(
  successEnvelopeSchema(z.strictObject({ id: z.uuid(), value: z.string() })),
) {}
