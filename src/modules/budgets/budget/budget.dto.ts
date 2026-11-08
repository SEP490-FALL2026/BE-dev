import { createZodDto } from '../../../infrastructure/http/dto/zod-dto';
import { z } from 'zod';
import { successEnvelopeSchema } from '../../../infrastructure/http/dto/success-envelope.dto';
import { LINE_DESCRIPTION_MAX, REASON_MAX } from './budget.policy';

const text = (max: number) => z.string().trim().min(1).max(max);
/** An amount a person gives: always in the reporting currency, which the system knows (`QĐ-98`). */
const money = z.strictObject({ amount: z.string().max(40) });
const moneyView = z.strictObject({ amount: z.string(), currency: z.string() });
const year = z.number().int().min(2000).max(2200);
export const LINES_MAX = 200;

/**
 * A line of a proposal or a version (`QĐ-82d`): what is bought, how much, where in the year it is bought, how long it
 * serves and how it repeats. The window, the service period and the cycle may be left out here so that a form that
 * lacks them is told which line and which fields (`US-06-10` AC-2), not simply refused.
 */
const lineBodyShape = z.strictObject({
  planId: z.uuid().optional(),
  description: text(LINE_DESCRIPTION_MAX).optional(),
  seats: z.number().int().min(1).max(100000).optional(),
  amount: money,
  note: text(REASON_MAX).optional(),
});
const lineBody = lineBodyShape
  .refine((line) => line.planId !== undefined || line.description !== undefined, {
    message: 'Give the plan or a description of the line.',
    path: ['description'],
  })
  .meta({
    description: 'A line is a plan or a description, the seats, the amount of the year and a note.',
  });

export const proposalBodySchema = z.strictObject({
  year,
  costCenterId: z.uuid().optional().meta({
    description:
      'The Cost Center the work is for, when the person answers for more than one that year (a department they head and one that starts on 1 January).',
  }),
  lines: z.array(lineBody).min(1).max(LINES_MAX),
  attachmentIds: z
    .array(z.uuid())
    .max(20)
    .refine((ids) => new Set(ids).size === ids.length, { message: 'A document is named once.' })
    .meta({ uniqueItems: true })
    .optional(),
});
export const resubmissionBodySchema = z.strictObject({
  lines: z.array(lineBody).min(1).max(LINES_MAX),
  attachmentIds: z
    .array(z.uuid())
    .max(20)
    .refine((ids) => new Set(ids).size === ids.length, { message: 'A document is named once.' })
    .meta({ uniqueItems: true })
    .optional(),
});
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
  /** Why the reserve is not the default share of the base; asked when the version is sent (`US-06-09` AC-30). */
  reserveReason: text(REASON_MAX),
  /** A forecast by quarter, never a limit: the four add up to the total or it is not saved (`US-06-09` AC-6). */
  quarters: quarters.nullable(),
};
/** A first version from the proposal that waits for Finance (`source` PROPOSAL, the default): the proposal and the base. */
const proposalVersionBody = z.strictObject({
  source: z.literal('PROPOSAL').optional(),
  proposalId: z.uuid(),
  base: versionFigures.base,
  reserve: versionFigures.reserve.optional(),
  reserveReason: versionFigures.reserveReason.optional(),
  quarters: versionFigures.quarters.optional(),
});
/** A first version built from the baseline (`source` BASELINE): only the Cost Center and the year; the base and the lines are the baseline's. */
const baselineVersionBody = z.strictObject({
  source: z.literal('BASELINE'),
  costCenterId: z.uuid(),
  year: z.number().int().min(2000).max(2200),
});
/**
 * A first version of a Cost Center and year: from the proposal that waits for Finance (`source` PROPOSAL, the default), or from the
 * baseline when nobody heads the department at the deadline (`source` BASELINE, `QĐ-100h`). A field of the other source is a 422 naming it.
 */
export const versionBodySchema = z.discriminatedUnion('source', [proposalVersionBody, baselineVersionBody]);
export const versionPatchSchema = z
  .strictObject({
    base: versionFigures.base,
    /** Why the base is changed: required when `base` differs from the one the draft has (`QĐ-100v`). */
    baseReason: text(REASON_MAX),
    reserve: versionFigures.reserve,
    /** `null` takes the reason away: the reserve is the default share again, or is sent with another reason. */
    reserveReason: versionFigures.reserveReason.nullable(),
    quarters: versionFigures.quarters,
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
    financeComment: text(REASON_MAX).nullable(),
    adjustmentReason: text(REASON_MAX).nullable(),
  })
  .partial()
  .refine((body) => Object.keys(body).length > 0, { message: 'Give at least one field.' })
  .meta({ minProperties: 1, description: 'Give at least one field.' });
export const addLinesBodySchema = z.strictObject({ lines: z.array(lineBody).min(1).max(LINES_MAX) });

export const pageQuery = {
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
};
export const proposalListQuerySchema = z.strictObject({
  state: z.enum(['SUBMITTED', 'WITHDRAWN', 'RETURNED', 'REVIEWED', 'CLOSED_FISCAL_YEAR_ENDED']).optional(),
  year: z.coerce.number().int().min(2000).max(2200).optional(),
  ...pageQuery,
});
export const versionListQuerySchema = z.strictObject({
  state: z.enum(['DRAFT', 'SENT', 'APPROVED', 'REJECTED', 'CHANGES_REQUESTED', 'EXPIRED']).optional(),
  year: z.coerce.number().int().min(2000).max(2200).optional(),
  ...pageQuery,
});
export const pageQuerySchema = z.strictObject(pageQuery);
const mineCostCenter = z.uuid().optional().meta({
  description:
    'The Cost Center asked about, when the caller answers for more than one that year (a department they head and one that starts on 1 January).',
});
export const mineQuerySchema = z.strictObject({
  year: z.coerce.number().int().min(2000).max(2200),
  costCenterId: mineCostCenter,
});
export const mineLinesQuerySchema = z.strictObject({
  year: z.coerce.number().int().min(2000).max(2200),
  costCenterId: mineCostCenter,
  ...pageQuery,
});
export const mineVersionsQuerySchema = z.strictObject({
  year: z.coerce.number().int().min(2000).max(2200).optional(),
  costCenterId: mineCostCenter,
  ...pageQuery,
});
export const budgetsQuerySchema = z.strictObject({
  year: z.coerce.number().int().min(2000).max(2200).optional(),
  ...pageQuery,
});
export const budgetSummaryQuerySchema = z.strictObject({ year: z.coerce.number().int().min(2000).max(2200) });
export const idParamSchema = z.strictObject({ id: z.uuid() });
export const lineParamSchema = z.strictObject({ id: z.uuid(), position: z.coerce.number().int().positive() });

export const employeeRef = z.strictObject({ employeeId: z.uuid(), employeeCode: z.string(), fullName: z.string() });
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
  /** The refused version this one follows when it is made again from the same proposal; set by the system. */
  rejectedPredecessorId: z.uuid().nullable(),
  base: moneyView,
  /** Why Finance moved the base, when it did (`QĐ-100v`). */
  baseReason: z.string().nullable(),
  /** Where the version came from: the head's proposal, or the baseline Finance built when nobody headed the department (`QĐ-100h`). */
  origin: z.enum(['PROPOSAL', 'BASELINE_NO_HEAD']),
  reserve: moneyView,
  /** The share of the base the reserve defaults to when the version was made; null for a version made before `QĐ-98`. */
  reservePercent: z.number().int().nullable(),
  /** The reserve the share gives for the base now; Finance sees it and may differ, with a reason. */
  defaultReserve: moneyView.nullable(),
  reserveReason: z.string().nullable(),
  total: moneyView,
  quarters: z.strictObject({ q1: moneyView, q2: moneyView, q3: moneyView, q4: moneyView }).nullable(),
  reason: z.string().nullable(),
  /** Set while the version was sent and nobody who works holds the role of the spending approver: nobody else decides it (`QĐ-93d`(1)). */
  waitingReason: z.enum(['NO_SPENDING_APPROVER']).nullable(),
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
  financeComment: z.string().nullable(),
  adjustmentReason: z.string().nullable(),
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
  /** The base of the current version, before the reserve. */
  base: moneyView,
  /** The reserve of the current version, kept apart from the base. */
  reserve: moneyView,
  total: moneyView,
  /** What is held against the budget by the commitments attached to it. */
  committed: moneyView,
  /** What has become an expense, which a commitment is not any more (`FR-5.8`). */
  spent: moneyView,
  /** The budget less what is held and what is spent; negative when more was committed than the budget allows (`US-06-07` AC-3). */
  remaining: moneyView,
  overCommitted: z.boolean(),
});
const summaryTotalSchema = z.strictObject({
  currency: z.string(),
  base: moneyView,
  reserve: moneyView,
  total: moneyView,
  committed: moneyView,
  spent: moneyView,
  remaining: moneyView,
  costCenterCount: z.number().int().nonnegative(),
  /** The Cost Centers whose budget is less than what is held and spent against it. */
  overBudgetCount: z.number().int().nonnegative(),
});
/** The company-wide figures of a year, added up for each currency: Cost Centers of two currencies are never added together. */
const budgetSummarySchema = z.strictObject({
  year: z.number().int(),
  /** Keyed by currency code, empty when no Cost Center has a current budget for the year. */
  totals: z.record(z.string(), summaryTotalSchema),
  /** When the last invoice was recorded, which is when the spent figure was last brought up to date; null when none was. */
  lastInvoiceRecordedAt: z.iso.datetime().nullable(),
});
export const mineVersionSummarySchema = z.strictObject({
  id: z.uuid(),
  year,
  number: z.number().int().positive(),
  state: z.enum(['SENT', 'APPROVED', 'REJECTED', 'CHANGES_REQUESTED', 'SUPERSEDED', 'EXPIRED']),
  sentAt: z.iso.datetime(),
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
/** A union is not a class to extend: the value makes the DTO of the route and the same name is the type of what it validates. */
export const VersionBodyDto = Object.defineProperty(createZodDto(versionBodySchema), 'name', {
  value: 'VersionBodyDto',
});
export type VersionBodyDto = z.infer<typeof versionBodySchema>;
export class VersionPatchDto extends createZodDto(versionPatchSchema) {}
export class LinePatchDto extends createZodDto(linePatchSchema) {}
export class AddLinesBodyDto extends createZodDto(addLinesBodySchema) {}
export class ProposalListQueryDto extends createZodDto(proposalListQuerySchema) {}
export class VersionListQueryDto extends createZodDto(versionListQuerySchema) {}
export class PageQueryDto extends createZodDto(pageQuerySchema) {}
export class MineQueryDto extends createZodDto(mineQuerySchema) {}
export class MineLinesQueryDto extends createZodDto(mineLinesQuerySchema) {}
export class MineVersionsQueryDto extends createZodDto(mineVersionsQuerySchema) {}
export class BudgetsQueryDto extends createZodDto(budgetsQuerySchema) {}
export class BudgetSummaryQueryDto extends createZodDto(budgetSummaryQuerySchema) {}
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
export class MineResponseDto extends createZodDto(successEnvelopeSchema(z.strictObject({ budget: mineSchema }))) {}
export class MineLinePageResponseDto extends createZodDto(page(versionLineSchema)) {}
export class MineVersionPageResponseDto extends createZodDto(page(mineVersionSummarySchema)) {}
export class BudgetTablePageResponseDto extends createZodDto(page(tableRowSchema)) {}
export class BudgetSummaryResponseDto extends createZodDto(successEnvelopeSchema(budgetSummarySchema)) {}
export class BudgetLineImportResponseDto extends createZodDto(
  successEnvelopeSchema(z.strictObject({ result: importSchema })),
) {}

export type ProposalWire = z.infer<typeof proposalSchema>;
export type ProposalSummaryWire = z.infer<typeof proposalSummarySchema>;
export type VersionSummaryWire = z.infer<typeof versionSummarySchema>;
export type ProposalLineWire = z.infer<typeof proposalLineSchema>;
export type VersionWire = z.infer<typeof versionSchema>;
export type VersionLineWire = z.infer<typeof versionLineSchema>;
export type MineWire = z.infer<typeof mineSchema>;
export type MineVersionSummaryWire = z.infer<typeof mineVersionSummarySchema>;
export type TableRowWire = z.infer<typeof tableRowSchema>;
export type BudgetSummaryWire = z.infer<typeof budgetSummarySchema>;
export type ImportWire = z.infer<typeof importSchema>;
