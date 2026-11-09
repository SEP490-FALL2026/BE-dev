import { Injectable } from '@nestjs/common';
import { formatAmount } from '../../../core/money/money';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { FinanceApi } from '../../finance/public/finance.api';
import { AccessRequestRepo } from '../access-request/access-request.repo';
import { codesOf } from '../spend/budget-check.policy';
import { BudgetCheckRepo, type CheckRecord } from '../spend/budget-check.repo';
import { SpendReviewNotFoundError } from '../spend/spend.errors';
import { SpendStepRepo } from '../spend/spend-step.repo';
import type { CheckWire } from './budget-check.dto';

export type Money = { amount: string; currency: string };

/**
 * What Finance and the spending approver read of the check of a request (`US-06-12`): the outcome, why it is blocked, how far over, and
 * the figures of its year in the route next to this one. Nobody else reads it: the head and the requester see where the request stands on
 * the request itself, and the IT Admin never reads a figure of the budget (`QĐ-82m` `INF-06`). A reader with no part in the check is
 * answered as if there were none.
 */
@Injectable()
export class BudgetCheckViewService {
  constructor(
    private readonly requests: AccessRequestRepo,
    private readonly checks: BudgetCheckRepo,
    private readonly steps: SpendStepRepo,
    private readonly finance: FinanceApi,
  ) {}

  /** The newest check of the request. Throws SpendReviewNotFoundError. */
  async latestCheck(actor: AuthenticatedPrincipal, requestId: string): Promise<CheckWire> {
    await this.requireReader(actor, requestId);
    const check = await this.checks.latest(requestId);
    if (!check) throw new SpendReviewNotFoundError();

    return this.checkWire(check);
  }

  /**
   * Finance reads every check; the person the spend step is given to reads the check of their own step, and nobody else
   * reads one (`US-06-01` AC-1). The head and the requester are not among them.
   */
  async requireReader(actor: AuthenticatedPrincipal, requestId: string): Promise<void> {
    if (!(await this.requests.findById(requestId))) throw new SpendReviewNotFoundError();
    if (actor.roles.includes('FINANCE')) return;
    const spend = await this.steps.findLatest(requestId, 'SPEND_APPROVAL');
    if (spend?.assigneeEmployeeId === actor.employeeId) return;

    throw new SpendReviewNotFoundError();
  }

  private async checkWire(check: CheckRecord): Promise<CheckWire> {
    const money = await this.formatter(check.currency);
    const optional = (minor: bigint | null) => (minor === null ? null : money(minor));
    // A check made before the three outcomes says only its code: within the budget, or not.
    const outcome =
      check.outcome ??
      (check.route === 'BLOCKED' || check.years.some((year) => year.code !== 'BUDGET_OK') ? 'BLOCKED' : 'WITHIN_BASE');

    return {
      id: check.id,
      number: check.number,
      trigger: check.trigger,
      route: check.route,
      outcome,
      blockedReasons: check.blockReasons,
      overBaseBy: optional(check.overBaseByMinor),
      overBy: optional(check.overByMinor),
      primaryCode: codesOf(check)[0] ?? null,
      bindingTotal: money(check.bindingTotalMinor),
      yearCount: check.years.length,
      ranAt: check.ranAt.toISOString(),
    };
  }

  async formatter(currency: string): Promise<(minor: bigint) => Money> {
    const units = (await this.finance.findCurrency(currency))?.minorUnit ?? 2;

    return (minor) => ({ amount: formatAmount(minor, units), currency });
  }
}
