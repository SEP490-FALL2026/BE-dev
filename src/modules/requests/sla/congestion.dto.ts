import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { successEnvelopeSchema } from '../../../infrastructure/http/dto/success-envelope.dto';
import { SLA_STEP_KINDS } from './step-sla.policy';

const pageQuery = {
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
};

export const congestionListQuerySchema = z.strictObject(pageQuery);
export const congestionStepsQuerySchema = z.strictObject({ holderEmployeeId: z.uuid().optional(), ...pageQuery });
export const congestionIncidentListQuerySchema = z.strictObject(pageQuery);

/** The incident the Super Admin records: who it is about (null for the steps nobody holds) and what happened. */
export const congestionIncidentBodySchema = z.strictObject({
  holderEmployeeId: z.uuid().nullable(),
  description: z.string().trim().min(1).max(1000),
});

const employeeRef = z.strictObject({ employeeId: z.uuid(), employeeCode: z.string(), fullName: z.string() });

const pagination = z.strictObject({
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  totalItems: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
});

/**
 * What the Super Admin sees of one holder: how many steps wait on them, how many of those were reminded at least once (the way to
 * read "late" without a calendar), how old the oldest is and how many reminders there were. It carries no amount and no figure of
 * a budget, and nothing here lets the Super Admin act on a step: the board only shows.
 */
export const congestionRowSchema = z.strictObject({
  /** Null for the steps nobody holds (they wait under control). */
  holder: employeeRef.nullable(),
  openSteps: z.number().int().nonnegative(),
  remindedSteps: z.number().int().nonnegative(),
  oldestAgeWorkingDays: z.number().int().nonnegative(),
  totalReminders: z.number().int().nonnegative(),
  /** The day of the organization, `YYYY-MM-DD`. */
  lastRemindedOn: z.string().nullable(),
  overThreshold: z.boolean(),
});

export const congestionStepSchema = z.strictObject({
  requestId: z.uuid(),
  stepId: z.uuid(),
  stepKind: z.enum(SLA_STEP_KINDS),
  state: z.enum(['PENDING', 'WAITING']),
  createdAt: z.iso.datetime(),
  dueAt: z.iso.datetime(),
  ageWorkingDays: z.number().int().nonnegative(),
  reminders: z.number().int().nonnegative(),
  /** The day of the organization, `YYYY-MM-DD`. */
  lastRemindedOn: z.string().nullable(),
});

export const congestionIncidentSchema = z.strictObject({
  id: z.uuid(),
  holder: employeeRef.nullable(),
  description: z.string(),
  openSteps: z.number().int().nonnegative(),
  oldestAgeWorkingDays: z.number().int().nonnegative(),
  recordedAt: z.iso.datetime(),
});

const pageOf = <T extends z.ZodType>(item: T) =>
  successEnvelopeSchema(z.strictObject({ items: z.array(item), pagination }));

export class CongestionListQueryDto extends createZodDto(congestionListQuerySchema) {}
export class CongestionStepsQueryDto extends createZodDto(congestionStepsQuerySchema) {}
export class CongestionIncidentListQueryDto extends createZodDto(congestionIncidentListQuerySchema) {}
export class CongestionIncidentBodyDto extends createZodDto(congestionIncidentBodySchema) {}
export class CongestionListResponseDto extends createZodDto(pageOf(congestionRowSchema)) {}
export class CongestionStepsResponseDto extends createZodDto(pageOf(congestionStepSchema)) {}
export class CongestionIncidentListResponseDto extends createZodDto(pageOf(congestionIncidentSchema)) {}
export class CongestionIncidentResponseDto extends createZodDto(
  successEnvelopeSchema(z.strictObject({ incident: congestionIncidentSchema })),
) {}

export type CongestionRowWire = z.infer<typeof congestionRowSchema>;
export type CongestionStepWire = z.infer<typeof congestionStepSchema>;
export type CongestionIncidentWire = z.infer<typeof congestionIncidentSchema>;
