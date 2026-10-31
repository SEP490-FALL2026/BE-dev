import { z } from 'zod';
import { responseBusinessDate } from '../../../infrastructure/http/dto/business-date.dto';
import { successEnvelopeSchema } from '../../../infrastructure/http/dto/success-envelope.dto';
import { createZodDto } from '../../../infrastructure/http/dto/zod-dto';
import { MY_SOFTWARE_STATUSES, MY_SOFTWARE_VIEWS } from './my-software.policy';

const querySchema = z.strictObject({
  view: z.enum(MY_SOFTWARE_VIEWS).default('current').meta({
    description:
      'current (the default): the rights held on the business day or starting later. ended: the rights that are no longer held.',
  }),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});

/** One right of the caller on a list: the software and plan, how it is granted, where it stands and until when. */
export const mySoftwareRightSummarySchema = z.strictObject({
  assignmentId: z.uuid(),
  application: z.strictObject({ id: z.uuid(), name: z.string() }),
  plan: z.strictObject({ id: z.uuid(), name: z.string() }),
  provisioningType: z.enum(['K1', 'K2', 'K3', 'K4', 'K5']),
  status: z.enum(MY_SOFTWARE_STATUSES),
  effectiveFrom: responseBusinessDate,
  grantedOn: responseBusinessDate.nullable(),
  effectiveFromLabel: z.string().nullable(),
  expectedEndDate: responseBusinessDate.nullable(),
  expiringSoon: z.boolean(),
  validUntil: responseBusinessDate.nullable(),
  successorAssignmentId: z.uuid().nullable(),
});

const pageSchema = z.strictObject({
  asOf: responseBusinessDate,
  view: z.enum(MY_SOFTWARE_VIEWS),
  items: z.array(mySoftwareRightSummarySchema),
  pagination: z.strictObject({
    page: z.number().int().positive(),
    pageSize: z.number().int().positive(),
    totalItems: z.number().int().nonnegative(),
    totalPages: z.number().int().nonnegative(),
  }),
});

export type MySoftwarePageWire = z.infer<typeof pageSchema>;

export class MySoftwareQueryDto extends createZodDto(querySchema) {}
export class MySoftwarePageResponseDto extends createZodDto(successEnvelopeSchema(pageSchema)) {}
