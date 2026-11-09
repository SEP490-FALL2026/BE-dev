import { z } from 'zod';
import { successEnvelopeSchema } from '../../../infrastructure/http/dto/success-envelope.dto';
import { createZodDto } from '../../../infrastructure/http/dto/zod-dto';

export const grantQueueQuerySchema = z.strictObject({
  beneficiaryEmployeeId: z.uuid().optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});

const employeeRef = z.strictObject({ employeeId: z.uuid(), employeeCode: z.string(), fullName: z.string() });

/** One request that waits for the IT Admin to carry it out. */
const grantQueueItemSchema = z.strictObject({
  requestId: z.uuid(),
  /** A request for a service account needs the boundary accepted before it is granted. */
  type: z.enum(['GRANT', 'SERVICE_ACCOUNT', 'GROUP_GRANT']),
  /** How many people the request is for: 1 but for a request for a group, whose approved people are a row each. */
  lineCount: z.number().int().positive(),
  /** The verdict of the IT Admin on a service account; null for any other request. */
  boundaryState: z.enum(['PENDING', 'ACCEPTED', 'REJECTED']).nullable(),
  plan: z.strictObject({ planId: z.uuid(), planName: z.string(), applicationName: z.string() }),
  beneficiary: employeeRef,
  requester: employeeRef,
  /** The day the access of a person who is not staff ends; null for staff. */
  expectedEndDate: z.string().nullable(),
  submittedAt: z.iso.datetime(),
});

const pagination = z.strictObject({
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  totalItems: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
});

export class GrantQueueQueryDto extends createZodDto(grantQueueQuerySchema) {}
export class GrantQueueResponseDto extends createZodDto(
  successEnvelopeSchema(z.strictObject({ items: z.array(grantQueueItemSchema), pagination })),
) {}

export type GrantQueueItemWire = z.infer<typeof grantQueueItemSchema>;
