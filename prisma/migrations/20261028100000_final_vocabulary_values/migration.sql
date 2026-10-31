-- Compatibility step of the vocabulary the release after this one writes (`g0-g6-final-business-baseline-remediation`, Task 1.9a,
-- spec L.10, review `P03-RV-03`): while the image that is running, or the one H7 recovers to after a failed deploy, is this one,
-- the database may already hold a row that carries one of these values (written by the image that failed). This release never
-- writes any of them; it must only read them. Only `ADD VALUE`: nothing here uses a value it adds (they are used by the migrations
-- and the code of the release after this one), and none can be taken back (`DB-05`), as `20261016090000_password_self_service`
-- did for its own values.
--
-- Six enum values. The cause of a group line is the same enum as the cause of a request (`access_request_lines.cancel_cause` is an
-- `AccessRequestCancelCause`), and the close reason of a provisioning task is a text column: neither has a value of its own to add.

-- F27: a paid request that is being drafted, before it is sent (`AccessRequestState.DRAFT`).
ALTER TYPE "AccessRequestState" ADD VALUE IF NOT EXISTS 'DRAFT';

-- F29: the IT Admin closes what is left of a request, or of a group line, because the beneficiary was transferred.
ALTER TYPE "AccessRequestCancelCause" ADD VALUE IF NOT EXISTS 'BENEFICIARY_TRANSFERRED';

-- F21: a seat taken away by the review that the new head makes after a transfer.
ALTER TYPE "RevocationSource" ADD VALUE IF NOT EXISTS 'POST_SETUP_REVIEW';

-- F62: a budget version, and a proposal, that the end of its fiscal year closes.
ALTER TYPE "BudgetVersionState" ADD VALUE IF NOT EXISTS 'EXPIRED';
ALTER TYPE "BudgetProposalState" ADD VALUE IF NOT EXISTS 'CLOSED_FISCAL_YEAR_ENDED';

-- F65: the check of the budget made again when Finance gives an outcome while a request waits.
ALTER TYPE "BudgetCheckTrigger" ADD VALUE IF NOT EXISTS 'FINANCE_OUTCOME_WHILE_WAITING';
