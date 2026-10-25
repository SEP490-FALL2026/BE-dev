import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { successEnvelopeSchema } from '../../../infrastructure/http/dto/success-envelope.dto';
import { ROLE_FLAGS } from '../personnel.types';

/** Every role flag with whether the person holds it: the wire has no list of them. */
const roleFlagsSchema = z.record(z.enum(ROLE_FLAGS), z.boolean());

/** What the person who leaves sees of their own departure: the last working day, how far it has come and the roles that need someone. */
export const departureNoticeSchema = z.strictObject({
  lastWorkingDay: z.string(),
  state: z.enum(['HANDING_OVER', 'LEFT']),
  level: z.enum(['LEAVING', 'OVERDUE_HANDOVER']),
  roleFlags: roleFlagsSchema,
});

/** The four states of the Super Admin role, each told apart, with why the holder cannot act and what is warned about a holder who leaves. */
export const superAdminWatchSchema = z.strictObject({
  status: z.enum(['HEALTHY', 'HOLDER_LEAVING_STILL_USABLE', 'HOLDER_UNUSABLE', 'NO_HOLDER']),
  reasons: z.record(z.enum(['LOCKED', 'LEFT', 'NOT_ACTIVATED', 'AWAITING_CREDENTIAL_RESET']), z.boolean()),
  warnings: z.record(z.enum(['HOLDER_LEAVING', 'HANDOVER_OVERDUE']), z.boolean()),
  holder: z
    .strictObject({
      id: z.uuid(),
      employeeCode: z.string(),
      fullName: z.string(),
      workState: z.enum(['WORKING', 'ON_LONG_LEAVE', 'HANDING_OVER', 'LEFT']),
      lastWorkingDay: z.string().nullable(),
    })
    .nullable(),
});

export type DepartureNoticeWire = z.infer<typeof departureNoticeSchema>;
export type SuperAdminWatchWire = z.infer<typeof superAdminWatchSchema>;

export class DepartureNoticeResponseDto extends createZodDto(successEnvelopeSchema(departureNoticeSchema)) {}
export class SuperAdminWatchResponseDto extends createZodDto(successEnvelopeSchema(superAdminWatchSchema)) {}
