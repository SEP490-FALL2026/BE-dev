import { createZodDto } from '../../../infrastructure/http/dto/zod-dto';
import { z } from 'zod';
import { REASON_MAX_LENGTH, withdrawBodySchema } from '../access-request/access-request.dto';
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
  })
  .meta({ description: 'A refusal (REJECT) gives its reason; an approval (APPROVE) gives none.' });

/**
 * The decision of the need on the people of a step (`US-05-17` AC-4): every person of the step, each approved or refused with the
 * reason, in one go, with what a head gives when they approve a request that costs money.
 */
export const lineNeedDecisionBodySchema = z
  .strictObject({
    lines: z.array(verdictSchema).min(1).max(GROUP_HEAD_MAX),
  })
  .superRefine((body, ctx) => {
    if (new Set(body.lines.map((line) => line.employeeId)).size !== body.lines.length) {
      ctx.addIssue({ code: 'custom', path: ['lines'], message: 'A person is decided once.' });
    }
  })
  .meta({
    description:
      'Each person of the step is decided once. A choice of line of the plan (spend) is accepted only ' +
      'when at least one person is approved.',
  });

/**
 * The decision of the spending approver on the people of the step (`US-05-17` AC-9, `US-06-01` AC-15): every person whose need is
 * confirmed, each approved or refused with the reason, in one go.
 */
export const lineSpendDecisionBodySchema = z
  .strictObject({
    lines: z.array(verdictSchema).min(1).max(GROUP_HEAD_MAX),
  })
  .superRefine((body, ctx) => {
    if (new Set(body.lines.map((line) => line.employeeId)).size !== body.lines.length) {
      ctx.addIssue({ code: 'custom', path: ['lines'], message: 'A person is decided once.' });
    }
  })
  .meta({
    description: 'Each person is decided once.',
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
    // A closing for a transfer gives its reason; `evidence` is the confirmation of the check with the vendor.
    if (body.cause === 'BENEFICIARY_TRANSFERRED' && body.note === undefined) {
      ctx.addIssue({ code: 'custom', path: ['note'], message: 'A closing for a transfer gives its reason.' });
    }
  })
  .meta({ description: 'A closing for a transfer (cause BENEFICIARY_TRANSFERRED) gives its reason in note.' });

export class LineNeedDecisionBodyDto extends createZodDto(lineNeedDecisionBodySchema) {}
export class LineSpendDecisionBodyDto extends createZodDto(lineSpendDecisionBodySchema) {}
export class LineWithdrawBodyDto extends createZodDto(withdrawBodySchema) {}
export class LineClosureBodyDto extends createZodDto(lineClosureBodySchema) {}
export class LineParamsDto extends createZodDto(z.strictObject({ id: z.uuid(), employeeId: z.uuid() })) {}
