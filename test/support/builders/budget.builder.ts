import { BudgetProposalBodyDto, DecisionBodyDto, VersionBodyDto } from '../../../src/modules/budgets/budget/budget.dto';
import { ProposalService } from '../../../src/modules/budgets/budget/proposal/proposal.service';
import { VersionDecisionService } from '../../../src/modules/budgets/budget/version/version-decision.service';
import { VersionService } from '../../../src/modules/budgets/budget/version/version.service';
import type { HttpTestApp } from '../http-test-app';
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
  /** The body of `POST /budget-proposals`. */
  proposal: object;
  /** The body of `POST /budget-versions`, without the proposal it is built from. */
  version: Record<string, unknown>;
}

/** Proposed, built, sent and approved; the version as `POST /budget-versions` answers it. */
export async function approvedBudget<T>(ctx: HttpTestApp, input: ApprovedBudgetInput): Promise<T> {
  const proposal = await ctx.app
    .get(ProposalService, { strict: false })
    .submit(await principalOf(ctx, input.headToken), BudgetProposalBodyDto.create(sent(input.proposal)));
  const versions = ctx.app.get(VersionService, { strict: false });
  const finance = await principalOf(ctx, input.financeToken);
  const version = await versions.createFromProposal(
    finance,
    VersionBodyDto.create(sent({ proposalId: proposal.id, ...input.version })),
  );
  await versions.send(finance, version.id);
  await ctx.app
    .get(VersionDecisionService, { strict: false })
    .decide(await principalOf(ctx, input.deciderToken), version.id, DecisionBodyDto.create({ decision: 'APPROVE' }));

  return JSON.parse(JSON.stringify(version)) as T;
}
