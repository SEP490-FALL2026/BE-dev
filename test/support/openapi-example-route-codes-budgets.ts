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
      '404': ['BUDGET_ATTACHMENT.NOT_FOUND'],
      '409': [
        'BUDGET.VERSION_NOT_EDITABLE',
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
    budgetCommitmentInvoiceRecord: {
      '404': ['BUDGET.COMMITMENT_NOT_FOUND'],
      '409': ['INVOICE.COMMITMENT_RELEASED', 'INVOICE.DUPLICATE', 'INVOICE.VENDOR_UNKNOWN'],
      '422': ['MONEY_OUT_OF_RANGE', 'MONEY_SCALE_EXCEEDED'],
    },
    budgetCommitmentRelease: {
      '404': ['BUDGET.COMMITMENT_NOT_FOUND'],
      '409': ['BUDGET.COMMITMENT_NOT_HELD', 'BUDGET.COMMITMENT_REQUEST_OPEN'],
    },
    budgetCommitmentReleases: {
      '404': ['BUDGET.COMMITMENT_NOT_FOUND'],
    },
    budgetCycleGet: {
      '404': ['BUDGET.CYCLE_NOT_FOUND'],
    },
    budgetCycleOpen: {
      '409': ['BUDGET.CYCLE_EXISTS'],
      '422': ['BUDGET.CYCLE_DEADLINES_INVALID', 'BUDGET.CYCLE_YEAR_PAST', 'MONEY_OUT_OF_RANGE', 'MONEY_SCALE_EXCEEDED'],
    },
    budgetCyclePublish: {
      '404': ['BUDGET.CYCLE_NOT_FOUND'],
      '409': ['BUDGET.CEILINGS_OVER_ANNUAL'],
      '422': ['BUDGET.CEILINGS_INCOMPLETE', 'BUDGET.CYCLE_YEAR_PAST'],
    },
    budgetCycleUpdate: {
      '404': ['BUDGET.CYCLE_NOT_FOUND'],
      '422': [
        'BUDGET.CYCLE_DEADLINES_INVALID',
        'BUDGET.CYCLE_REASON_REQUIRED',
        'BUDGET.CYCLE_YEAR_PAST',
        'MONEY_OUT_OF_RANGE',
        'MONEY_SCALE_EXCEEDED',
      ],
    },
    budgetDepartmentCeilingsSet: {
      '404': ['BUDGET.CYCLE_NOT_FOUND'],
      '422': [
        'BUDGET.CEILING_DEPARTMENT_INVALID',
        'BUDGET.CYCLE_YEAR_PAST',
        'MONEY_OUT_OF_RANGE',
        'MONEY_SCALE_EXCEEDED',
      ],
    },
    budgetMine: {
      '403': ['BUDGET.NOT_YOUR_COST_CENTER'],
      '422': ['BUDGET.COST_CENTER_REQUIRED'],
    },
    budgetMineLineList: {
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
    budgetProposalLineList: {
      '404': ['BUDGET.PROPOSAL_NOT_FOUND'],
    },
    budgetProposalResubmit: {
      '404': ['BUDGET.PROPOSAL_NOT_FOUND'],
      '409': [
        'BUDGET.CYCLE_NOT_PUBLISHED',
        'BUDGET.PROPOSAL_ALREADY_OPEN',
        'BUDGET.PROPOSAL_CANNOT_RESUBMIT',
        'FINANCE.SETUP_INCOMPLETE',
      ],
      '422': [
        'BUDGET.CURRENCY_NOT_REPORTING',
        'BUDGET.PLAN_NOT_FOUND',
        'BUDGET.YEAR_ENDED',
        'BUDGET_ATTACHMENT.NOT_ATTACHABLE',
        'CURRENCY_NOT_SUPPORTED',
        'MONEY_OUT_OF_RANGE',
        'MONEY_SCALE_EXCEEDED',
      ],
    },
    budgetProposalReturn: {
      '404': ['BUDGET.PROPOSAL_NOT_FOUND'],
      '409': ['BUDGET.PROPOSAL_CANNOT_RETURN'],
      '422': ['BUDGET.YEAR_ENDED'],
    },
    budgetProposalSubmit: {
      '403': ['BUDGET.NOT_YOUR_COST_CENTER'],
      '404': ['BUDGET.COST_CENTER_NOT_FOUND'],
      '409': ['BUDGET.CYCLE_NOT_PUBLISHED', 'BUDGET.PROPOSAL_ALREADY_OPEN', 'FINANCE.SETUP_INCOMPLETE'],
      '422': [
        'BUDGET.COST_CENTER_REQUIRED',
        'BUDGET.CURRENCY_NOT_REPORTING',
        'BUDGET.PLAN_NOT_FOUND',
        'BUDGET.YEAR_ENDED',
        'BUDGET_ATTACHMENT.NOT_ATTACHABLE',
        'CURRENCY_NOT_SUPPORTED',
        'MONEY_OUT_OF_RANGE',
        'MONEY_SCALE_EXCEEDED',
      ],
    },
    budgetProposalWithdraw: {
      '404': ['BUDGET.PROPOSAL_NOT_FOUND'],
      '409': ['BUDGET.PROPOSAL_CANNOT_WITHDRAW'],
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
      '404': ['BUDGET.PROPOSAL_NOT_FOUND'],
      '409': ['BUDGET.PROPOSAL_NOT_SUBMITTED', 'BUDGET.VERSION_IN_FLIGHT', 'FINANCE.SETUP_INCOMPLETE'],
      '422': [
        'BUDGET.CURRENCY_NOT_REPORTING',
        'BUDGET.QUARTERS_MISMATCH',
        'BUDGET.YEAR_ENDED',
        'CURRENCY_NOT_SUPPORTED',
        'MONEY_OUT_OF_RANGE',
        'MONEY_SCALE_EXCEEDED',
      ],
    },
    budgetVersionDecide: {
      '403': ['BUDGET.CONFLICT_OF_INTEREST', 'BUDGET.NOT_SPENDING_APPROVER', 'BUDGET.OWN_VERSION'],
      '404': ['BUDGET.VERSION_NOT_FOUND'],
      '409': ['BUDGET.VERSION_NOT_SENT'],
      '422': ['BUDGET.YEAR_ENDED'],
    },
    budgetVersionGet: {
      '403': ['AUTHORIZATION.FORBIDDEN'],
      '404': ['BUDGET.VERSION_NOT_FOUND'],
    },
    budgetVersionHistoryList: {
      '403': ['AUTHORIZATION.FORBIDDEN'],
      '404': ['BUDGET.VERSION_NOT_FOUND'],
    },
    budgetVersionImport: {
      '404': ['BUDGET.VERSION_NOT_FOUND'],
      '409': ['BUDGET.VERSION_NOT_EDITABLE'],
      '422': ['BUDGET.IMPORT_FILE_INVALID', 'BUDGET.YEAR_ENDED'],
    },
    budgetVersionLineAdd: {
      '404': ['BUDGET.VERSION_NOT_FOUND'],
      '409': ['BUDGET.VERSION_NOT_EDITABLE'],
      '422': [
        'BUDGET.CURRENCY_NOT_REPORTING',
        'BUDGET.PLAN_NOT_FOUND',
        'BUDGET.YEAR_ENDED',
        'CURRENCY_NOT_SUPPORTED',
        'MONEY_OUT_OF_RANGE',
        'MONEY_SCALE_EXCEEDED',
      ],
    },
    budgetVersionLineList: {
      '403': ['AUTHORIZATION.FORBIDDEN'],
      '404': ['BUDGET.VERSION_NOT_FOUND'],
    },
    budgetVersionLineUpdate: {
      '404': ['BUDGET.LINE_NOT_FOUND', 'BUDGET.VERSION_NOT_FOUND'],
      '409': ['BUDGET.VERSION_NOT_EDITABLE'],
      '422': [
        'BUDGET.ADJUSTMENT_REASON_REQUIRED',
        'BUDGET.CURRENCY_NOT_REPORTING',
        'BUDGET.PLAN_NOT_FOUND',
        'BUDGET.YEAR_ENDED',
        'CURRENCY_NOT_SUPPORTED',
        'MONEY_OUT_OF_RANGE',
        'MONEY_SCALE_EXCEEDED',
      ],
    },
    budgetVersionList: {
      '403': ['AUTHORIZATION.FORBIDDEN'],
    },
    budgetVersionSend: {
      '404': ['BUDGET.VERSION_NOT_FOUND'],
      '409': ['BUDGET.PROPOSAL_NOT_SUBMITTED', 'BUDGET.VERSION_NOT_EDITABLE'],
      '422': ['BUDGET.RESERVE_REASON_REQUIRED', 'BUDGET.YEAR_ENDED'],
    },
    budgetVersionUpdate: {
      '404': ['BUDGET.VERSION_NOT_FOUND'],
      '409': ['BUDGET.VERSION_NOT_EDITABLE'],
      '422': [
        'BUDGET.CURRENCY_NOT_REPORTING',
        'BUDGET.QUARTERS_MISMATCH',
        'BUDGET.YEAR_ENDED',
        'CURRENCY_NOT_SUPPORTED',
        'MONEY_OUT_OF_RANGE',
        'MONEY_SCALE_EXCEEDED',
      ],
    },
  };
