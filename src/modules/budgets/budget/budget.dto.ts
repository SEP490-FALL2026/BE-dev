import { createZodDto } from '../../../infrastructure/http/dto/zod-dto';
import { z } from 'zod';
import { successEnvelopeSchema } from '../../../infrastructure/http/dto/success-envelope.dto';
import { LINE_DESCRIPTION_MAX, REASON_MAX } from './budget.policy';
import { businessDate } from '../../../infrastructure/http/dto/business-date.dto';

const text = (max: number) => z.string().trim().min(1).max(max);
const money = z.strictObject({ amount: z.string().max(40), currency: z.string().regex(/^[A-Z]{3}$/) });
const moneyView = z.strictObject({ amount: z.string(), currency: z.string() });
const year = z.number().int().min(2000).max(2200);
const cycle = z.enum(['MONTHLY', 'QUARTERLY', 'ANNUAL', 'ONE_TIME']);
export const LINES_MAX = 200;

/**
 * A line of a proposal or a version (`QĐ-82d`): what is bought, how much, where in the year it is bought, how long it
 * serves and how it repeats. The window, the service period and the cycle may be left out here so that a form that
 * lacks them is told which line and which fields (`US-06-10` AC-2), not simply refused.
 */
const lineBody = z.strictObject({
  description: text(LINE_DESCRIPTION_MAX),
  planId: z.uuid().optional(),
  seats: z.number().int().min(1).max(100000).optional(),
  amount: money,
  windowFrom: businessDate.optional(),
  windowTo: businessDate.optional(),
  servicePeriodMonths: z.number().int().min(1).max(120).optional(),
  repeatCycle: cycle.optional(),
  quoteValidUntil: businessDate.optional(),
  note: text(REASON_MAX).optional(),
});

export const proposalBodySchema = z.strictObject({
  costCenterId: z.uuid(),
  year,
  lines: z.array(lineBody).min(1).max(LINES_MAX),
});
export const resubmissionBodySchema = z.strictObject({ lines: z.array(lineBody).min(1).max(LINES_MAX) });
export const returnBodySchema = z.strictObject({ reason: text(REASON_MAX) });
/**
 * The decision of the spending approver on a version (`US-06-11`): approve, refuse, or ask Finance to look again. A refusal
 * and a request to look again give their reason; an approval gives none. There is no way to change a figure here (`QĐ-82f`).
 */
export const decisionBodySchema = z
  .strictObject({
    decision: z.enum(['APPROVE', 'REJECT', 'REQUEST_CHANGES']),
    reason: text(REASON_MAX).optional(),
  })
  .superRefine((body, ctx) => {
    if (body.decision !== 'APPROVE' && body.reason === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['reason'],
        message: 'A refusal, or a request to look again, gives its reason.',
      });
    }
    if (body.decision === 'APPROVE' && body.reason !== undefined) {
      ctx.addIssue({ code: 'custom', path: ['reason'], message: 'An approval gives no reason.' });
    }
  })
  .meta({
    description:
      'A refusal (REJECT) or a request to look again (REQUEST_CHANGES) gives its reason; an approval (APPROVE) gives none.',
  });

const quarters = z.strictObject({ q1: money, q2: money, q3: money, q4: money });
const versionFigures = {
  base: money,
  reserve: money,
  /** A line is high value when it is over this share of what is left of the year, in whole percent (`US-06-12`). */
  highValuePercent: z.number().int().min(0).max(100),
  /** The other way a line is high value: over this amount whatever is left; null sets none (`QĐ-82c`). */
  highValueAmount: money.nullable(),
  /** A forecast by quarter, never a limit: the four add up to the total or it is not saved (`US-06-09` AC-6). */
  quarters: quarters.nullable(),
};
/** A first version of a Cost Center and year, built from the proposal that waits for Finance. */
export const versionBodySchema = z.strictObject({
  proposalId: z.uuid(),
  base: versionFigures.base,
  reserve: versionFigures.reserve,
  highValuePercent: versionFigures.highValuePercent,
  highValueAmount: versionFigures.highValueAmount.optional(),
  quarters: versionFigures.quarters.optional(),
});
/** A change of the current budget: a new version that is current only once the spending approver approves it. */
export const revisionBodySchema = z.strictObject({
  costCenterId: z.uuid(),
  year,
  base: versionFigures.base.optional(),
  reserve: versionFigures.reserve.optional(),
  highValuePercent: versionFigures.highValuePercent.optional(),
  highValueAmount: versionFigures.highValueAmount.optional(),
  quarters: versionFigures.quarters.optional(),
  reason: text(REASON_MAX).optional(),
});
export const versionPatchSchema = z
  .strictObject({
    base: versionFigures.base,
    reserve: versionFigures.reserve,
    highValuePercent: versionFigures.highValuePercent,
    highValueAmount: versionFigures.highValueAmount,
    quarters: versionFigures.quarters,
    reason: text(REASON_MAX).nullable(),
  })
  .partial()
  .refine((body) => Object.keys(body).length > 0, { message: 'Give at least one field.' })
  .meta({ minProperties: 1, description: 'Give at least one field.' });
export const linePatchSchema = z
  .strictObject({
    description: text(LINE_DESCRIPTION_MAX),
    planId: z.uuid().nullable(),
    seats: z.number().int().min(1).max(100000).nullable(),
    amount: money,
    windowFrom: businessDate,
    windowTo: businessDate,
    servicePeriodMonths: z.number().int().min(1).max(120),
    repeatCycle: cycle,
    quoteValidUntil: businessDate.nullable(),
    financeComment: text(REASON_MAX).nullable(),
    adjustmentReason: text(REASON_MAX).nullable(),
  })
  .partial()
  .refine((body) => Object.keys(body).length > 0, { message: 'Give at least one field.' })
  .meta({ minProperties: 1, description: 'Give at least one field.' });
export const addLinesBodySchema = z.strictObject({ lines: z.array(lineBody).min(1).max(LINES_MAX) });
/** A move of the purchase window of a line of the current budget, with its reason; an amount is given only to be refused. */
export const windowBodySchema = z
  .strictObject({
    windowFrom: businessDate.optional(),
    windowTo: businessDate.optional(),
    amount: money.optional(),
    reason: text(REASON_MAX).optional(),
  })
  .refine((body) => body.windowFrom !== undefined || body.windowTo !== undefined || body.amount !== undefined, {
    message: 'Give the new window.',
  })
  .meta({ description: 'Give at least one of windowFrom, windowTo and amount.' });

const pageQuery = {
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
};
export const proposalListQuerySchema = z.strictObject({
  state: z.enum(['SUBMITTED', 'WITHDRAWN', 'RETURNED', 'REVIEWED', 'CLOSED_FISCAL_YEAR_ENDED']).optional(),
  year: z.coerce.number().int().min(2000).max(2200).optional(),
  ...pageQuery,
});
export const versionListQuerySchema = z.strictObject({
  state: z.enum(['DRAFT', 'SENT', 'APPROVED', 'REJECTED', 'CHANGES_REQUESTED', 'SUPERSEDED', 'EXPIRED']).optional(),
  year: z.coerce.number().int().min(2000).max(2200).optional(),
  ...pageQuery,
});
export const pageQuerySchema = z.strictObject(pageQuery);
export const mineQuerySchema = z.strictObject({ year: z.coerce.number().int().min(2000).max(2200) });
export const mineLinesQuerySchema = z.strictObject({ year: z.coerce.number().int().min(2000).max(2200), ...pageQuery });
export const budgetsQuerySchema = z.strictObject({
  year: z.coerce.number().int().min(2000).max(2200).optional(),
  ...pageQuery,
});
export const idParamSchema = z.strictObject({ id: z.uuid() });
export const lineParamSchema = z.strictObject({ id: z.uuid(), position: z.coerce.number().int().positive() });

const employeeRef = z.strictObject({ employeeId: z.uuid(), employeeCode: z.string(), fullName: z.string() });
const costCenterRef = z.strictObject({ id: z.uuid(), code: z.string(), name: z.string() });
const pagination = z.strictObject({
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  totalItems: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
});
export const page = <T extends z.ZodType>(item: T) =>
  successEnvelopeSchema(z.strictObject({ items: z.array(item), pagination }));

const proposalSchema = z.strictObject({
  id: z.uuid(),
  costCenter: costCenterRef,
  year: z.number().int(),
  state: z.enum(['SUBMITTED', 'WITHDRAWN', 'RETURNED', 'REVIEWED', 'CLOSED_FISCAL_YEAR_ENDED']),
  previousProposalId: z.uuid().nullable(),
  /** The proposal this one follows, when the version made from that one was refused and the need changed; set by the system. */
  successorOfProposalId: z.uuid().nullable(),
  /** The proposal that follows this one, if any. */
  successorProposalId: z.uuid().nullable(),
  total: moneyView,
  submittedBy: employeeRef.nullable(),
  submittedAt: z.iso.datetime(),
  returned: z.strictObject({ reason: z.string(), by: employeeRef.nullable(), at: z.iso.datetime() }).nullable(),
  withdrawnAt: z.iso.datetime().nullable(),
  /** When a successor was sent, which is when this proposal stopped being the open one. */
  succeededAt: z.iso.datetime().nullable(),
  /** When the year ended on a proposal that was never used and closed it. */
  closedAt: z.iso.datetime().nullable(),
});
/** What a list of proposals shows of each: enough to find it and to see where it stands; the rest is in the proposal itself. */
const proposalSummarySchema = z.strictObject({
  id: z.uuid(),
  costCenter: costCenterRef,
  year: z.number().int(),
  state: z.enum(['SUBMITTED', 'WITHDRAWN', 'RETURNED', 'REVIEWED', 'CLOSED_FISCAL_YEAR_ENDED']),
  previousProposalId: z.uuid().nullable(),
  total: moneyView,
  submittedAt: z.iso.datetime(),
});
const proposalLineSchema = z.strictObject({
  position: z.number().int().positive(),
  description: z.string(),
  planId: z.uuid().nullable(),
  seats: z.number().int().nullable(),
  amount: moneyView,
  windowFrom: z.string(),
  windowTo: z.string(),
  servicePeriodMonths: z.number().int(),
  repeatCycle: cycle,
  quoteValidUntil: z.string().nullable(),
  note: z.string().nullable(),
});
const versionSchema = z.strictObject({
  id: z.uuid(),
  costCenter: costCenterRef,
  year: z.number().int(),
  number: z.number().int().positive(),
  kind: z.enum(['INITIAL', 'REVISION']),
  state: z.enum(['DRAFT', 'SENT', 'APPROVED', 'REJECTED', 'CHANGES_REQUESTED', 'SUPERSEDED', 'EXPIRED']),
  proposalId: z.uuid().nullable(),
  basedOnVersionId: z.uuid().nullable(),
  /** The refused version this one follows when it is made again from the same proposal; set by the system. */
  rejectedPredecessorId: z.uuid().nullable(),
  base: moneyView,
  reserve: moneyView,
  total: moneyView,
  highValuePercent: z.number().int(),
  highValueAmount: moneyView.nullable(),
  quarters: z.strictObject({ q1: moneyView, q2: moneyView, q3: moneyView, q4: moneyView }).nullable(),
  reason: z.string().nullable(),
  /** The current budget this revision replaces, as it is: what the approver compares the total with. */
  previousTotal: moneyView.nullable(),
  /** The latest decision of the spending approver on it. */
  decision: z
    .strictObject({
      decision: z.enum(['APPROVED', 'REJECTED', 'CHANGES_REQUESTED']),
      by: employeeRef.nullable(),
      reason: z.string().nullable(),
      at: z.iso.datetime(),
    })
    .nullable(),
  createdBy: employeeRef.nullable(),
  createdAt: z.iso.datetime(),
  sentAt: z.iso.datetime().nullable(),
  /** When the draft was detached from the proposal that was withdrawn or given back: it stays a draft and is neither changed nor sent. */
  detachedAt: z.iso.datetime().nullable(),
  /** The year ended on this version before it ever became current. */
  neverCurrent: z.boolean(),
  /** When the year ended on the version: the current one stays as the reference budget of the year. */
  expiredAt: z.iso.datetime().nullable(),
});
/** What a list of versions shows of each: where it stands and its total; the figures and the reason are in the version. */
const versionSummarySchema = z.strictObject({
  id: z.uuid(),
  costCenter: costCenterRef,
  year: z.number().int(),
  number: z.number().int().positive(),
  kind: z.enum(['INITIAL', 'REVISION']),
  state: z.enum(['DRAFT', 'SENT', 'APPROVED', 'REJECTED', 'CHANGES_REQUESTED', 'SUPERSEDED', 'EXPIRED']),
  total: moneyView,
  createdAt: z.iso.datetime(),
  sentAt: z.iso.datetime().nullable(),
});
const versionLineSchema = z.strictObject({
  position: z.number().int().positive(),
  proposalPosition: z.number().int().positive().nullable(),
  description: z.string(),
  planId: z.uuid().nullable(),
  seats: z.number().int().nullable(),
  amount: moneyView,
  windowFrom: z.string(),
  windowTo: z.string(),
  servicePeriodMonths: z.number().int(),
  repeatCycle: cycle,
  quoteValidUntil: z.string().nullable(),
  financeComment: z.string().nullable(),
  adjustmentReason: z.string().nullable(),
  overdue: z.boolean(),
});
const lineChangeSchema = z.strictObject({
  before: z.strictObject({ windowFrom: z.string(), windowTo: z.string() }),
  after: z.strictObject({ windowFrom: z.string(), windowTo: z.string() }),
  reason: z.string(),
  changedBy: employeeRef.nullable(),
  changedAt: z.iso.datetime(),
});
/** What a head of department sees of the budget of the department: the lines of the current budget, never what is left. */
const mineSchema = z.strictObject({
  costCenter: costCenterRef,
  year: z.number().int(),
  status: z.enum(['ACTIVE', 'NO_ACTIVE_BUDGET']),
  total: moneyView.nullable(),
  version: z.strictObject({ id: z.uuid(), number: z.number().int().positive() }).nullable(),
  /** The refusal of the spending approver when the latest version of the year was refused: the head reads why. */
  latestRefusal: z.strictObject({ reason: z.string(), at: z.iso.datetime() }).nullable(),
  proposal: z.strictObject({ id: z.uuid(), state: z.string(), total: moneyView }).nullable(),
});
const tableRowSchema = z.strictObject({
  costCenter: costCenterRef,
  year: z.number().int(),
  versionId: z.uuid(),
  number: z.number().int().positive(),
  total: moneyView,
  /** What is held against the budget by the commitments attached to it. */
  committed: moneyView,
  /** What has become an expense, which a commitment is not any more (`FR-5.8`). */
  spent: moneyView,
  /** The budget less what is held and what is spent; negative when more was committed than the budget allows (`US-06-07` AC-3). */
  remaining: moneyView,
  overCommitted: z.boolean(),
});
const importSchema = z.strictObject({
  added: z.number().int().nonnegative(),
  rejected: z.number().int().nonnegative(),
  errors: z.array(z.strictObject({ row: z.number().int().positive(), code: z.string() })),
});

export class BudgetProposalBodyDto extends createZodDto(proposalBodySchema) {}
export class ResubmissionBodyDto extends createZodDto(resubmissionBodySchema) {}
export class BudgetProposalReturnBodyDto extends createZodDto(returnBodySchema) {}
export class DecisionBodyDto extends createZodDto(decisionBodySchema) {}
export class VersionBodyDto extends createZodDto(versionBodySchema) {}
export class RevisionBodyDto extends createZodDto(revisionBodySchema) {}
export class VersionPatchDto extends createZodDto(versionPatchSchema) {}
export class LinePatchDto extends createZodDto(linePatchSchema) {}
export class AddLinesBodyDto extends createZodDto(addLinesBodySchema) {}
export class WindowBodyDto extends createZodDto(windowBodySchema) {}
export class ProposalListQueryDto extends createZodDto(proposalListQuerySchema) {}
export class VersionListQueryDto extends createZodDto(versionListQuerySchema) {}
export class PageQueryDto extends createZodDto(pageQuerySchema) {}
export class MineQueryDto extends createZodDto(mineQuerySchema) {}
export class MineLinesQueryDto extends createZodDto(mineLinesQuerySchema) {}
export class BudgetsQueryDto extends createZodDto(budgetsQuerySchema) {}
export class IdParamDto extends createZodDto(idParamSchema) {}
export class LineParamDto extends createZodDto(lineParamSchema) {}

export class ProposalResponseDto extends createZodDto(
  successEnvelopeSchema(z.strictObject({ proposal: proposalSchema })),
) {}
export class ProposalPageResponseDto extends createZodDto(page(proposalSummarySchema)) {}
export class ProposalLinePageResponseDto extends createZodDto(page(proposalLineSchema)) {}
export class VersionResponseDto extends createZodDto(
  successEnvelopeSchema(z.strictObject({ version: versionSchema })),
) {}
export class VersionPageResponseDto extends createZodDto(page(versionSummarySchema)) {}
export class VersionLinePageResponseDto extends createZodDto(page(versionLineSchema)) {}
export class LineResponseDto extends createZodDto(successEnvelopeSchema(z.strictObject({ line: versionLineSchema }))) {}
export class LineChangePageResponseDto extends createZodDto(page(lineChangeSchema)) {}
export class MineResponseDto extends createZodDto(successEnvelopeSchema(z.strictObject({ budget: mineSchema }))) {}
export class MineLinePageResponseDto extends createZodDto(page(versionLineSchema)) {}
export class BudgetTablePageResponseDto extends createZodDto(page(tableRowSchema)) {}
export class BudgetLineImportResponseDto extends createZodDto(
  successEnvelopeSchema(z.strictObject({ result: importSchema })),
) {}

export type ProposalWire = z.infer<typeof proposalSchema>;
export type ProposalSummaryWire = z.infer<typeof proposalSummarySchema>;
export type VersionSummaryWire = z.infer<typeof versionSummarySchema>;
export type ProposalLineWire = z.infer<typeof proposalLineSchema>;
export type VersionWire = z.infer<typeof versionSchema>;
export type VersionLineWire = z.infer<typeof versionLineSchema>;
export type LineChangeWire = z.infer<typeof lineChangeSchema>;
export type MineWire = z.infer<typeof mineSchema>;
export type TableRowWire = z.infer<typeof tableRowSchema>;
export type ImportWire = z.infer<typeof importSchema>;
