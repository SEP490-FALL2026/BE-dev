import { BudgetProposalBodyDto, DecisionBodyDto, VersionBodyDto } from '../../../src/modules/budgets/budget/budget.dto';
import { ProposalService } from '../../../src/modules/budgets/proposal/proposal.service';
import { VersionDecisionService } from '../../../src/modules/budgets/version/version-decision.service';
import { VersionCreationService } from '../../../src/modules/budgets/version/version-creation.service';
import { VersionService } from '../../../src/modules/budgets/version/version.service';
import type { HttpTestApp } from '../http-test-app';
import { attachedVersionFile, uploadedProposalFile } from '../budget-files';
import { DecisionChecklists } from '../decision-checklist';
import { principalOf, sent } from './account.builder';

/*
 * T2.2: a budget a suite only stands on — the head's proposal, the version Finance builds from it, sent, and the decision of
 * the spending approver — made by the services those four routes call, as the bearer of each token, on the bodies their
 * validation pipes would have passed on (see organization.builder.ts). The suites of the budget routes call the routes. The
 * version is returned as the wire the service gives the route, JSON as it would cross HTTP. No assertion lives here.
 */

export interface ApprovedBudgetInput {
  headToken: string;
  financeToken: string;
  deciderToken: string;
  /** The body of `POST /budget-proposals` (`BM-10`); the file is uploaded here when it names none. */
  proposal: object;
  /** The body of `POST /budget-versions`, without the proposal it is built from. */
  version: Record<string, unknown>;
}

/** Proposed, built, sent and approved; the version as `POST /budget-versions` answers it. */
export async function approvedBudget<T>(ctx: HttpTestApp, input: ApprovedBudgetInput): Promise<T> {
  const head = await principalOf(ctx, input.headToken);
  // BM-10 names one file at least, and a version is sent with one at least (QĐ-111ab, QĐ-111ac).
  const attachmentIds = [await uploadedProposalFile(ctx.sql, head.employeeId)];
  const proposal = await ctx.app
    .get(ProposalService, { strict: false })
    .submit(head, BudgetProposalBodyDto.create(sent({ attachmentIds, ...input.proposal })));
  const versions = ctx.app.get(VersionService, { strict: false });
  const finance = await principalOf(ctx, input.financeToken);
  const version = await ctx.app
    .get(VersionCreationService, { strict: false })
    .createFromProposal(
      finance,
      VersionBodyDto.create(sent({ proposalId: proposal.id, ...input.version })) as Extract<
        VersionBodyDto,
        { proposalId: string }
      >,
    );
  await attachedVersionFile(ctx.sql, version.id, finance.employeeId);
  await versions.send(finance, version.id);
  // The decision of the spending approver answers the checklist of the step of the version all Yes (`QĐ-111ap`).
  const decider = await principalOf(ctx, input.deciderToken);
  const checklists = new DecisionChecklists();
  const { rows } = await ctx.sql.query<{ organization_id: string }>(
    `SELECT organization_id FROM employees WHERE id = $1`,
    [decider.employeeId],
  );
  await checklists.load(ctx.sql, rows[0].organization_id);
  await ctx.app
    .get(VersionDecisionService, { strict: false })
    .decide(decider, version.id, DecisionBodyDto.create({ decision: 'APPROVE', checklist: checklists.yes('4.7') }));

  return JSON.parse(JSON.stringify(version)) as T;
}
