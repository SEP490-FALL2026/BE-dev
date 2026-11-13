import { z } from 'zod';
import { successEnvelopeSchema } from '../../../infrastructure/http/dto/success-envelope.dto';
import { createZodDto } from '../../../infrastructure/http/dto/zod-dto';

const idParamSchema = z.strictObject({ id: z.uuid() });

/** The IT Admin who takes everything the one who leaves answers for: the only thing the caller knows (SPEC P5). */
const handoverBodySchema = z.strictObject({ toItAdminEmployeeId: z.uuid() });

/** What the hand-over moved, and to whom (the file is read again for the rest). */
const handoverResultSchema = z.strictObject({
  sourceKind: z.enum(['OFFBOARDING_CASE', 'DEPARTMENT_TRANSFER']),
  sourceId: z.uuid(),
  fromEmployeeId: z.uuid(),
  toItAdminEmployeeId: z.uuid(),
  subscriptions: z.number().int().nonnegative(),
  applications: z.number().int().nonnegative(),
  handedOverAt: z.string(),
});

/** The `itHandover` section of a departure or a transfer (SPEC P3): what the person still answers for, and the hand-over when it was done. */
export const itHandoverSchema = z.strictObject({
  state: z.enum(['PENDING', 'DONE']),
  /** What the person still answers for now: 0 and 0 once the hand-over is done. */
  subscriptions: z.number().int().nonnegative(),
  applications: z.number().int().nonnegative(),
  /** The hand-over of everything to one IT Admin, when an IT Admin made it. */
  handedOver: z
    .strictObject({
      at: z.string(),
      toItAdminEmployeeId: z.uuid(),
      subscriptions: z.number().int().nonnegative(),
      applications: z.number().int().nonnegative(),
    })
    .nullable(),
});

export type ItHandoverWire = z.output<typeof itHandoverSchema>;

export class ItHandoverIdParamDto extends createZodDto(idParamSchema) {}
export class ItHandoverBodyDto extends createZodDto(handoverBodySchema) {}
export class ItHandoverResultResponseDto extends createZodDto(successEnvelopeSchema(handoverResultSchema)) {}
