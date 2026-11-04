import { z } from 'zod';
import { isBusinessDate } from '../../core/business-date';
import { nullableJsonColumn } from '../../infrastructure/database/json-column';

/**
 * What a handover of the head of a department moved, kept with the transfer or the offboarding case so a move or a cancellation
 * restores it exactly. Both capabilities keep the same facts, so the two columns share one shape and one file.
 */
const schema = z.object({
  endedPeriodId: z.string(),
  endedPeriodValidTo: z.string().refine(isBusinessDate).nullable(),
  createdPeriodId: z.string().nullable(),
  successor: z.enum(['EMPLOYEE', 'NONE']),
  successorEmployeeId: z.string().nullable(),
});

const encode = (facts: z.output<typeof schema>) => ({
  endedPeriodId: facts.endedPeriodId,
  endedPeriodValidTo: facts.endedPeriodValidTo,
  createdPeriodId: facts.createdPeriodId,
  successor: facts.successor,
  successorEmployeeId: facts.successorEmployeeId,
});

/** `department_transfers.head_handover`: NULL for a transfer that moves no head. */
export const transferHeadHandoverJson = nullableJsonColumn({
  table: 'department_transfers',
  column: 'head_handover',
  schema,
  encode,
});

/** `offboarding_cases.head_handover`: NULL for a case of a person who heads nothing. */
export const offboardingHeadHandoverJson = nullableJsonColumn({
  table: 'offboarding_cases',
  column: 'head_handover',
  schema,
  encode,
});
