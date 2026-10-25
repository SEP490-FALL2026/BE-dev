import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { successEnvelopeSchema } from '../../../infrastructure/http/dto/success-envelope.dto';

const pagination = z.strictObject({
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  totalItems: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
});

const planSchema = z.strictObject({
  planId: z.uuid(),
  planName: z.string(),
  applicationId: z.uuid(),
  applicationName: z.string(),
});

/** A request the person is the beneficiary of that is not over: where it stands and whether the IT Admin may close it now. */
const openRequestSchema = z.strictObject({
  requestId: z.uuid(),
  type: z.enum(['GRANT', 'SERVICE_ACCOUNT', 'RENEWAL', 'GROUP_GRANT']),
  state: z.string(),
  /** The plan asked for; null for software that is not in the catalog yet. */
  plan: planSchema.nullable(),
  requester: z.strictObject({ employeeId: z.uuid(), employeeCode: z.string(), fullName: z.string() }),
  submittedAt: z.iso.datetime(),
  /** The request is for a group of people: only the line of this person is open here, and closing it ends that line, not the request. */
  group: z.boolean(),
  /**
   * The person has left and the IT Admin may close it now: `POST /access-requests/{id}/cancellation` for a request that is for them
   * alone, `POST /access-requests/{id}/lines/{employeeId}/departure-closure` for their line of a request for a group.
   */
  cancellable: z.boolean(),
});

/** A grant of the person that is not finished: the task, the request it answers for and the plan. */
const openGrantTaskSchema = z.strictObject({
  taskId: z.uuid(),
  status: z.enum(['QUEUED', 'RETRY_SCHEDULED', 'IN_PROGRESS', 'FAILED']),
  requestId: z.uuid().nullable(),
  assignmentId: z.uuid(),
  plan: planSchema,
  createdAt: z.iso.datetime(),
});

export type OpenRequestWire = z.infer<typeof openRequestSchema>;
export type OpenGrantTaskWire = z.infer<typeof openGrantTaskSchema>;

export class OpenRequestPageResponseDto extends createZodDto(
  successEnvelopeSchema(z.strictObject({ items: z.array(openRequestSchema), pagination })),
) {}
export class OpenGrantTaskPageResponseDto extends createZodDto(
  successEnvelopeSchema(z.strictObject({ items: z.array(openGrantTaskSchema), pagination })),
) {}
