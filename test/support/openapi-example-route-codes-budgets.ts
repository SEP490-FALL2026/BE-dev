import type { RouteErrorStatus } from './openapi-example-manifest';

/**
 * Part of ROUTE_ERROR_CODES (budgets (G5)), traced on BE `0da8f56` (Prompt 02, 26/10/2026) and, for the budget lifecycle
 * (`g0-g6-final-business-baseline-remediation`, Tasks 4.4 to 4.10, 27/10/2026), through each handler to the mapper of
 * budget.http-errors.ts: see openapi-example-manifest.ts. `BUDGET.VERSION_NUMBER_TAKEN` is mapped but not listed: the year lock
 * lets two writers of a Cost Center and year take the number one after the other, so no route can answer it.
 */
export const ROUTE_ERROR_CODES_BUDGETS: Readonly<Record<string, Partial<Record<RouteErrorStatus, readonly string[]>>>> =
  {
    budgetAttachmentComplete: {
      '403': ['BUDGET.NOT_YOUR_COST_CENTER'],
      '404': ['BUDGET_ATTACHMENT.NOT_FOUND'],
      '409': [
        'BUDGET.VERSION_NOT_EDITABLE',
        'FINANCE.SETUP_INCOMPLETE',
        'BUDGET_ATTACHMENT.LIMIT_REACHED',
        'BUDGET_ATTACHMENT.NOT_AWAITING_UPLOAD',
        'BUDGET_ATTACHMENT.UPLOAD_EXPIRED',
        'BUDGET_ATTACHMENT.UPLOAD_PENDING',
      ],
      '422': ['BUDGET.YEAR_ENDED', 'BUDGET_ATTACHMENT.UPLOAD_MISMATCH'],
    },
    budgetAttachmentDiscard: {
      '404': ['BUDGET_ATTACHMENT.NOT_FOUND'],
      '409': ['BUDGET_ATTACHMENT.NOT_DISCARDABLE'],
    },
    budgetAttachmentLink: {
      '404': ['BUDGET_ATTACHMENT.NOT_FOUND'],
    },
    budgetCommitmentInvoiceList: {
      '404': ['BUDGET.COMMITMENT_NOT_FOUND'],
    },
    budgetCommitmentRelease: {
      '404': ['BUDGET.COMMITMENT_NOT_FOUND'],
      '409': ['BUDGET.COMMITMENT_NOT_HELD', 'BUDGET.COMMITMENT_REQUEST_OPEN'],
    },
    budgetCommitmentReleases: {
      '404': ['BUDGET.COMMITMENT_NOT_FOUND'],
    },
    budgetCycleBaseline: {
      '403': ['BUDGET.NOT_YOUR_COST_CENTER'],
      '404': ['BUDGET.CYCLE_NOT_FOUND'],
    },
    budgetCycleGet: {
      '404': ['BUDGET.CYCLE_NOT_FOUND'],
    },
    budgetCyclePackage: {
      '404': ['BUDGET.CYCLE_NOT_FOUND'],
    },
    budgetCycleCreate: {
      '409': ['BUDGET.CYCLE_EXISTS'],
      '422': ['BUDGET.CYCLE_DEADLINES_INVALID', 'BUDGET.CYCLE_YEAR_PAST', 'MONEY_OUT_OF_RANGE', 'MONEY_SCALE_EXCEEDED'],
    },
    budgetReviewPeriodClose: {
      '409': ['BUDGET_REVIEW.PERIOD_EXISTS', 'BUDGET_REVIEW.SEAT_MONTHS_NOT_READY'],
      '422': ['BUDGET_REVIEW.MONTH_NOT_ENDED', 'BUDGET_REVIEW.NO_BUDGET_FOR_YEAR'],
    },
    budgetAdjustmentCreate: {
      '409': [
        'BUDGET_CYCLE.NOT_OPEN',
        'BUDGET_ADJUSTMENT.CYCLE_NOT_LOCKED',
        'FINANCE.SETUP_INCOMPLETE',
        'BUDGET_ADJUSTMENT.VERSION_IN_FLIGHT',
        'BUDGET_ADJUSTMENT.BUDGET_IN_PREPARATION',
      ],
      '422': [
        'BUDGET.YEAR_ENDED',
        'BUDGET_ADJUSTMENT.INVALID_SHAPE',
        'BUDGET_ADJUSTMENT.OVER_UNALLOCATED',
        'BUDGET_ADJUSTMENT.BELOW_FORECAST_FLOOR',
        'BUDGET_ADJUSTMENT.OVER_BASE',
        'BUDGET_ADJUSTMENT.OVER_REMAINING',
        'BUDGET_ADJUSTMENT.NO_BUDGET',
      ],
    },
    budgetAdjustmentDecide: {
      '404': ['BUDGET_ADJUSTMENT.NOT_FOUND'],
      '409': [
        'BUDGET_ADJUSTMENT.ALREADY_DECIDED',
        'BUDGET_CYCLE.NOT_OPEN',
        'BUDGET_ADJUSTMENT.CYCLE_NOT_LOCKED',
        'FINANCE.SETUP_INCOMPLETE',
        'BUDGET_ADJUSTMENT.VERSION_IN_FLIGHT',
        'BUDGET_ADJUSTMENT.BUDGET_IN_PREPARATION',
      ],
      '422': [
        'BUDGET.YEAR_ENDED',
        'BUDGET_ADJUSTMENT.OVER_UNALLOCATED',
        'BUDGET_ADJUSTMENT.BELOW_FORECAST_FLOOR',
        'BUDGET_ADJUSTMENT.OVER_BASE',
        'BUDGET_ADJUSTMENT.OVER_REMAINING',
        'BUDGET_ADJUSTMENT.NO_BUDGET',
      ],
    },
    budgetReviewPeriodGet: {
      '404': ['BUDGET_REVIEW.NOT_FOUND'],
    },
    budgetReviewLineExplain: {
      '404': ['BUDGET_REVIEW.LINE_NOT_FOUND', 'BUDGET_REVIEW.NOT_FOUND'],
      '409': ['BUDGET_REVIEW.NOT_AWAITING_EXPLANATIONS'],
      '422': ['BUDGET_REVIEW.EXPLANATION_NOT_REQUIRED'],
    },
    budgetReviewPeriodSign: {
      '404': ['BUDGET_REVIEW.NOT_FOUND'],
      '409': ['BUDGET_REVIEW.ALREADY_SIGNED'],
    },
    budgetCycleDelete: {
      '404': ['BUDGET.CYCLE_NOT_FOUND'],
      '409': ['BUDGET_CYCLE.NOT_DRAFT'],
      '422': ['BUDGET.CYCLE_YEAR_PAST'],
    },
    budgetCycleOpen: {
      '404': ['BUDGET.CYCLE_NOT_FOUND'],
      '409': ['BUDGET_CYCLE.ALREADY_OPEN', 'BUDGET_CYCLE.LOCKED'],
      '422': ['BUDGET.CYCLE_YEAR_PAST', 'BUDGET_CYCLE.DEADLINE_PASSED'],
    },
    budgetCycleUpdate: {
      '404': ['BUDGET.CYCLE_NOT_FOUND'],
      '409': ['BUDGET_CYCLE.LOCKED'],
      '422': [
        'BUDGET.CYCLE_DEADLINES_INVALID',
        'BUDGET.CYCLE_REASON_REQUIRED',
        'BUDGET.CYCLE_YEAR_PAST',
        'BUDGET_CYCLE.DEADLINE_PASSED',
        'MONEY_OUT_OF_RANGE',
        'MONEY_SCALE_EXCEEDED',
      ],
    },
    budgetMine: {
      '403': ['BUDGET.NOT_YOUR_COST_CENTER'],
      '422': ['BUDGET.COST_CENTER_REQUIRED'],
    },
    budgetMineVersionList: {
      '403': ['BUDGET.NOT_YOUR_COST_CENTER'],
      '422': ['BUDGET.COST_CENTER_REQUIRED'],
    },
    budgetProposalAttachmentDeclare: {
      '403': ['BUDGET.NOT_YOUR_COST_CENTER'],
      '409': ['BUDGET_ATTACHMENT.LIMIT_REACHED', 'FINANCE.SETUP_INCOMPLETE'],
      '422': ['BUDGET_ATTACHMENT.FILE_INVALID', 'BUDGET_ATTACHMENT.TOO_LARGE', 'BUDGET_ATTACHMENT.TYPE_NOT_ALLOWED'],
    },
    budgetProposalAttachmentList: {
      '404': ['BUDGET.PROPOSAL_NOT_FOUND'],
    },
    budgetProposalGet: {
      '404': ['BUDGET.PROPOSAL_NOT_FOUND'],
    },
    budgetProposalResubmit: {
      '404': ['BUDGET.PROPOSAL_NOT_FOUND'],
      '409': [
        'BUDGET_CYCLE.LOCKED',
        'BUDGET_CYCLE.NOT_OPEN',
        'BUDGET.PROPOSAL_ALREADY_OPEN',
        'BUDGET.PROPOSAL_CANNOT_RESUBMIT',
        'FINANCE.SETUP_INCOMPLETE',
      ],
      '422': [
        'BUDGET.CURRENCY_NOT_REPORTING',
        'BUDGET.YEAR_ENDED',
        'BUDGET_ATTACHMENT.NOT_ATTACHABLE',
        'CURRENCY_NOT_SUPPORTED',
        'MONEY_OUT_OF_RANGE',
        'MONEY_SCALE_EXCEEDED',
      ],
    },
    budgetProposalReturn: {
      '404': ['BUDGET.PROPOSAL_NOT_FOUND'],
      '409': ['BUDGET_CYCLE.LOCKED', 'BUDGET_CYCLE.NOT_OPEN', 'BUDGET.PROPOSAL_CANNOT_RETURN'],
      '422': ['BUDGET.YEAR_ENDED'],
    },
    budgetProposalSubmit: {
      '403': ['BUDGET.NOT_YOUR_COST_CENTER'],
      '404': ['BUDGET.COST_CENTER_NOT_FOUND'],
      '409': [
        'BUDGET_CYCLE.LOCKED',
        'BUDGET_CYCLE.NOT_OPEN',
        'BUDGET.PROPOSAL_ALREADY_OPEN',
        'FINANCE.SETUP_INCOMPLETE',
      ],
      '422': [
        'BUDGET.COST_CENTER_REQUIRED',
        'BUDGET.CURRENCY_NOT_REPORTING',
        'BUDGET.YEAR_ENDED',
        'BUDGET_ATTACHMENT.NOT_ATTACHABLE',
        'CURRENCY_NOT_SUPPORTED',
        'MONEY_OUT_OF_RANGE',
        'MONEY_SCALE_EXCEEDED',
      ],
    },
    budgetProposalWithdraw: {
      '404': ['BUDGET.PROPOSAL_NOT_FOUND'],
      '409': ['BUDGET_CYCLE.LOCKED', 'BUDGET_CYCLE.NOT_OPEN', 'BUDGET.PROPOSAL_CANNOT_WITHDRAW'],
      '422': ['BUDGET.YEAR_ENDED'],
    },
    budgetVersionAttachmentDeclare: {
      '404': ['BUDGET.VERSION_NOT_FOUND'],
      '409': ['BUDGET.VERSION_NOT_EDITABLE', 'BUDGET_ATTACHMENT.LIMIT_REACHED'],
      '422': [
        'BUDGET.YEAR_ENDED',
        'BUDGET_ATTACHMENT.FILE_INVALID',
        'BUDGET_ATTACHMENT.TOO_LARGE',
        'BUDGET_ATTACHMENT.TYPE_NOT_ALLOWED',
      ],
    },
    budgetVersionAttachmentList: {
      '403': ['AUTHORIZATION.FORBIDDEN'],
      '404': ['BUDGET.VERSION_NOT_FOUND'],
    },
    budgetVersionAttachmentRemove: {
      '404': ['BUDGET.VERSION_NOT_FOUND', 'BUDGET_ATTACHMENT.NOT_FOUND'],
      '409': ['BUDGET.VERSION_NOT_EDITABLE', 'BUDGET_ATTACHMENT.ALREADY_REMOVED'],
      '422': ['BUDGET.YEAR_ENDED'],
    },
    budgetVersionCreate: {
      '404': ['BUDGET.COST_CENTER_NOT_FOUND', 'BUDGET.PROPOSAL_NOT_FOUND'],
      '409': [
        'BUDGET.BASELINE_VERSION_NOT_ALLOWED',
        'BUDGET.PROPOSAL_NOT_SUBMITTED',
        'BUDGET.VERSION_IN_FLIGHT',
        'FINANCE.SETUP_INCOMPLETE',
      ],
      '422': [
        'BUDGET.CURRENCY_NOT_REPORTING',
        'BUDGET.YEAR_ENDED',
        'CURRENCY_NOT_SUPPORTED',
        'MONEY_OUT_OF_RANGE',
        'MONEY_SCALE_EXCEEDED',
      ],
    },
    budgetVersionDecide: {
      '403': ['BUDGET.CONFLICT_OF_INTEREST', 'BUDGET.NOT_SPENDING_APPROVER', 'BUDGET.OWN_VERSION'],
      '404': ['BUDGET.VERSION_NOT_FOUND'],
      '409': [
        'BUDGET.CYCLE_CURRENCY_MISMATCH',
        'BUDGET.VERSION_NOT_SENT',
        'BUDGET_VERSION.OVER_CEILING',
        'POLICY.NOT_IN_FORCE',
        'POLICY.VERSION_CHANGED',
      ],
      '422': ['BUDGET.YEAR_ENDED', 'POLICY.CHECKLIST_HAS_NO', 'POLICY.CHECKLIST_INCOMPLETE'],
    },
    budgetVersionGet: {
      '403': ['AUTHORIZATION.FORBIDDEN'],
      '404': ['BUDGET.VERSION_NOT_FOUND'],
    },
    budgetVersionHistoryList: {
      '403': ['AUTHORIZATION.FORBIDDEN'],
      '404': ['BUDGET.VERSION_NOT_FOUND'],
    },
    budgetVersionList: {
      '403': ['AUTHORIZATION.FORBIDDEN'],
    },
    budgetVersionSend: {
      '404': ['BUDGET.VERSION_NOT_FOUND'],
      '409': [
        'BUDGET.CYCLE_CURRENCY_MISMATCH',
        'BUDGET_CYCLE.NOT_OPEN',
        'BUDGET_VERSION.OVER_CEILING',
        'BUDGET.PROPOSAL_NOT_SUBMITTED',
        'BUDGET.VERSION_NOT_EDITABLE',
      ],
      '422': ['BUDGET_VERSION.ATTACHMENT_REQUIRED', 'BUDGET.RESERVE_REASON_REQUIRED', 'BUDGET.YEAR_ENDED'],
    },
    budgetVersionUpdate: {
      '404': ['BUDGET.VERSION_NOT_FOUND'],
      '409': ['BUDGET.VERSION_NOT_EDITABLE'],
      '422': [
        'BUDGET.BASE_REASON_REQUIRED',
        'BUDGET.CURRENCY_NOT_REPORTING',
        'BUDGET.YEAR_ENDED',
        'CURRENCY_NOT_SUPPORTED',
        'MONEY_OUT_OF_RANGE',
        'MONEY_SCALE_EXCEEDED',
      ],
    },
  };
