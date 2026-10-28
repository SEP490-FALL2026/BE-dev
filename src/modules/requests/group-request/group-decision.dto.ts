import { createZodDto } from '../../../infrastructure/http/dto/zod-dto';
import { z } from 'zod';
import { isBusinessDate } from '../../../core/business-date';
import {
  REASON_MAX_LENGTH,
  oneChoice,
  planLineChoiceFields,
  withdrawBodySchema,
} from '../access-request/access-request.dto';
import { GROUP_HEAD_MAX } from './group-request.policy';

const reason = z.string().trim().min(1).max(REASON_MAX_LENGTH);

/** What the decider says of one person: approve, or refuse with the reason (`US-05-04` AC-14). */
const verdictSchema = z
  .strictObject({
    employeeId: z.uuid(),
    decision: z.enum(['APPROVE', 'REJECT']),
    reason: reason.optional(),
  })
  .superRefine((verdict, ctx) => {
    if (verdict.decision === 'REJECT' && verdict.reason === undefined) {
      ctx.addIssue({ code: 'custom', path: ['reason'], message: 'A refusal gives its reason.' });
    }
    if (verdict.decision === 'APPROVE' && verdict.reason !== undefined) {
      ctx.addIssue({ code: 'custom', path: ['reason'], message: 'Only a refusal gives a reason.' });
    }
  });

/**
 * The decision of the need on the people of a step (`US-05-17` AC-4): every person of the step, each approved or refused with the
 * reason, in one go, with what a head gives when they approve a request that costs money. A term over twelve months is confirmed in
 * so many words, once, for the people approved.
 */
export const lineNeedDecisionBodySchema = z
  .strictObject({
    lines: z.array(verdictSchema).min(1).max(GROUP_HEAD_MAX),
    termConfirmation: z.strictObject({ reason }).optional(),
    spend: z
      .strictObject({
        ...planLineChoiceFields,
        expectedSpendOn: z
          .string()
          .refine(isBusinessDate, { message: 'Must be a real date as YYYY-MM-DD.' })
          .optional(),
      })
      .superRefine(oneChoice)
      .optional(),
  })
  .superRefine((body, ctx) => {
    const approves = body.lines.some((line) => line.decision === 'APPROVE');
    if (!approves && body.termConfirmation !== undefined) {
      ctx.addIssue({ code: 'custom', path: ['termConfirmation'], message: 'Only an approval confirms a term.' });
    }
    if (!approves && body.spend !== undefined) {
      ctx.addIssue({ code: 'custom', path: ['spend'], message: 'Only an approval chooses a line of the plan.' });
    }
    if (new Set(body.lines.map((line) => line.employeeId)).size !== body.lines.length) {
      ctx.addIssue({ code: 'custom', path: ['lines'], message: 'A person is decided once.' });
    }
  });

/**
 * The decision of the spending approver on the people of the step (`US-05-17` AC-9, `US-06-01` AC-15): every person whose need is
 * confirmed, each approved or refused with the reason, in one go, and the exception an approval accepts, with its reason and the years
 * it names, exactly as for a request of one person.
 */
export const lineSpendDecisionBodySchema = z
  .strictObject({
    lines: z.array(verdictSchema).min(1).max(GROUP_HEAD_MAX),
    override: z
      .strictObject({
        reason,
        years: z
          .array(z.number().int().min(2000).max(2200))
          .min(1)
          .max(20)
          .refine((years) => new Set(years).size === years.length, { message: 'A year is named once.' }),
      })
      .optional(),
  })
  .superRefine((body, ctx) => {
    if (body.override !== undefined && !body.lines.some((line) => line.decision === 'APPROVE')) {
      ctx.addIssue({ code: 'custom', path: ['override'], message: 'Only an approval accepts an exception.' });
    }
    if (new Set(body.lines.map((line) => line.employeeId)).size !== body.lines.length) {
      ctx.addIssue({ code: 'custom', path: ['lines'], message: 'A person is decided once.' });
    }
  });

/**
 * The body of removing a person who left, or was transferred, from a request for a group: `cause` says which; `note` is what the IT
 * Admin keeps with the closing, and the reason of a closing for a transfer; `evidence` is what they did to undo a grant that is being
 * worked, and, for a transfer, the confirmation that they checked with the vendor and collected the invitation.
 */
export const lineClosureBodySchema = z
  .strictObject({
    cause: z.enum(['BENEFICIARY_LEFT', 'BENEFICIARY_TRANSFERRED']),
    note: reason.optional(),
    evidence: reason.optional(),
  })
  .superRefine((body, ctx) => {
    // A closing for a transfer gives its reason (F29); `evidence` is the confirmation of the check with the vendor (spec F).
    if (body.cause === 'BENEFICIARY_TRANSFERRED' && body.note === undefined) {
      ctx.addIssue({ code: 'custom', path: ['note'], message: 'A closing for a transfer gives its reason.' });
    }
  });

export class LineNeedDecisionBodyDto extends createZodDto(lineNeedDecisionBodySchema) {}
export class LineSpendDecisionBodyDto extends createZodDto(lineSpendDecisionBodySchema) {}
export class LineWithdrawBodyDto extends createZodDto(withdrawBodySchema) {}
export class LineClosureBodyDto extends createZodDto(lineClosureBodySchema) {}
export class LineParamsDto extends createZodDto(z.strictObject({ id: z.uuid(), employeeId: z.uuid() })) {}
