import { SpendHarness, Unit } from '../../support/spend-harness';

const h = new SpendHarness();
const M = 1_000_000;

/**
 * What follows the check of the budget over PostgreSQL (BR-MF1-06g, BR-MF1-06h, L1-23). Rewritten from "what follows the review of Finance": the
 * review, the wait for a budget and the return by Finance are gone (QĐ-97c); a request is within the base, uses the reserve or is blocked, and
 * a blocked one stays in the queue of its head until it is sent on again.
 */
describe('what follows the check of the budget over PostgreSQL (BR-MF1-06g, BR-MF1-06h, L1-23)', () => {
  let plan: string;
  let counter = 0;

  beforeAll(async () => {
    await h.start();
    await h.withApprover();
    plan = await h.planOf(await h.subscription(10));
    await h
      .declareTaxProfile((await h.vendorOf(plan)).id, [{ taxType: 'GTGT', ratePercent: '10', deductible: true }])
      .expect(200);
  }, 240000);

  afterAll(async () => {
    await h.stop();
  });

  const unit = async (): Promise<Unit> => {
    counter += 1;

    return h.departmentWithHead(`P-F${counter}`);
  };
  /** 100 base, 20 held and 40 spent: 40 left of the base; with a reserve of 10 there are 50 left in all. */
  const budgeted = async (reserve = 0) => {
    const u = await unit();
    await h.budgetFor(u, { total: 100 * M, held: 20 * M, spent: 40 * M, reserve });

    return u;
  };
  const checks = async (requestId: string) =>
    (
      await h.ctx.sql.query<{
        number: number;
        trigger: string;
        route: string;
        outcome: string | null;
        block_reasons: string[];
        over_base_by_minor: string | null;
        over_by_minor: string | null;
      }>(
        `SELECT number, trigger, route, outcome, block_reasons, over_base_by_minor, over_by_minor
           FROM request_budget_checks WHERE request_id = $1 ORDER BY number`,
        [requestId],
      )
    ).rows;
  const headWire = async (id: string, u: Unit) =>
    h.dataOf<{
      request: { spend: { stage: string; blockedReasons: string[]; overBy: { amount: string } | null } };
    }>(await h.fetch(id, u.head.account).expect(200)).request.spend;

  describe('BR-MF1-06g: one outcome for each check, kept with its reasons', () => {
    it('BR-MF1-06g: within the base opens the spend step at once, and the check says it went to the approver', async () => {
      const u = await budgeted();
      const id = await h.paidRequest(u, plan, { amount: 36 * M });

      const routed = await h.route(id, u.head.account);

      expect(routed).toMatchObject({ status: 'ROUTED', outcome: 'WITHIN_BASE' });
      expect(await checks(id)).toEqual([
        expect.objectContaining({
          trigger: 'SUBMISSION',
          route: 'SPEND_APPROVAL',
          outcome: 'WITHIN_BASE',
          block_reasons: [],
        }),
      ]);
      expect(await h.state(id)).toBe('AWAITING_SPEND_DECISION');
      expect(await h.steps(id, 'SPEND_APPROVAL')).toEqual([expect.objectContaining({ state: 'PENDING' })]);
    });

    it('BR-MF1-06h: uses the reserve when it is over the base but not over the reserve: no step, it stays in the queue of its head', async () => {
      const u = await budgeted(10 * M);
      const id = await h.paidRequest(u, plan, { amount: 45 * M });

      const routed = await h.route(id, u.head.account);

      expect(routed).toMatchObject({ status: 'ROUTED', outcome: 'USES_RESERVE' });
      const [check] = await checks(id);
      expect(check).toMatchObject({
        outcome: 'USES_RESERVE',
        route: 'SPEND_APPROVAL',
        over_base_by_minor: String(5 * M),
      });
      expect(await h.state(id)).toBe('AWAITING_SPEND_SUBMISSION');
      expect(await h.steps(id, 'SPEND_APPROVAL')).toEqual([]);
      expect(await headWire(id, u)).toMatchObject({
        stage: 'RESERVE_CONFIRMATION',
        blockedReasons: [],
        overBy: { amount: String(5 * M) },
      });
    });

    it('BR-MF1-06g(3)(i): is blocked over the reserve, with how far over, and nothing is made for Finance or the approver', async () => {
      const u = await budgeted(10 * M);
      const id = await h.paidRequest(u, plan, { amount: 55 * M });

      await h.route(id, u.head.account);

      const [check] = await checks(id);
      expect(check).toMatchObject({
        outcome: 'BLOCKED',
        route: 'BLOCKED',
        block_reasons: ['OVER_RESERVE'],
        over_by_minor: String(5 * M),
      });
      expect(await h.steps(id, 'SPEND_APPROVAL')).toEqual([]);
      expect(await h.state(id)).toBe('AWAITING_SPEND_SUBMISSION');
      expect(await headWire(id, u)).toMatchObject({
        stage: 'BLOCKED',
        blockedReasons: ['OVER_RESERVE'],
        overBy: { amount: String(5 * M) },
      });
    });

    it('BR-MF1-06g(3): keeps every reason when there are several: no approved budget and a quote that is no longer valid', async () => {
      const u = await unit(); // no budget at all
      const id = await h.staleRequest(u);

      await h.route(id, u.head.account);

      const [check] = await checks(id);
      expect([...check.block_reasons].sort()).toEqual(['NO_APPROVED_BUDGET', 'PRICE_EXPIRED']);
      expect(check.outcome).toBe('BLOCKED');
    });
  });

  describe('L1-23: a blocked request is not checked again by itself', () => {
    it('stays in the queue when the budget it lacked is approved later, and is within the base when its head sends it on again', async () => {
      const u = await unit();
      const id = await h.paidRequest(u, plan, { amount: 10 * M });
      await h.route(id, u.head.account);
      expect((await checks(id))[0]).toMatchObject({ outcome: 'BLOCKED', block_reasons: ['NO_APPROVED_BUDGET'] });

      await h.budgetFor(u, { total: 100 * M });

      // Nothing listens to the approval of the version any more: no new check, the request waits where it was.
      expect(await checks(id)).toHaveLength(1);
      expect(await h.state(id)).toBe('AWAITING_SPEND_SUBMISSION');
      await h.sendOn([id], u.head.account).expect(201);
      expect((await checks(id)).map((check) => [check.trigger, check.outcome])).toEqual([
        ['SUBMISSION', 'BLOCKED'],
        ['SUBMISSION', 'WITHIN_BASE'],
      ]);
      expect(await h.state(id)).toBe('AWAITING_SPEND_DECISION');
    });
  });

  describe('DA3-01: the confirmation checks the request again for the day of the confirmation', () => {
    it('makes a check of its own (RESERVE_CONFIRMATION) and opens the step with the confirmation kept on it', async () => {
      const u = await budgeted(10 * M);
      const id = await h.paidRequest(u, plan, { amount: 45 * M });
      await h.route(id, u.head.account);

      await h.confirmReserve(id, { reason: 'Customer deadline' }, u.head.account).expect(200);

      expect((await checks(id)).map((check) => [check.trigger, check.outcome])).toEqual([
        ['SUBMISSION', 'USES_RESERVE'],
        ['RESERVE_CONFIRMATION', 'USES_RESERVE'],
      ]);
      expect(await h.state(id)).toBe('AWAITING_SPEND_DECISION');
    });

    it('BR-MF1-06h: answers 200 with BLOCKED and opens nothing when the check made again blocks the request', async () => {
      const u = await budgeted(10 * M);
      const id = await h.paidRequest(u, plan, { amount: 45 * M });
      await h.route(id, u.head.account);
      // Something else was approved meanwhile: the request is over the reserve now.
      const version = (
        await h.ctx.sql.query<{ id: string }>(
          `SELECT id FROM budget_versions WHERE cost_center_id = $1 AND year = $2 AND state = 'APPROVED'`,
          [u.department.unitId, h.year],
        )
      ).rows[0].id;
      await h.commit(u, version, h.year, 30 * M, 'HELD');

      const response = await h.confirmReserve(id, { reason: 'Too late' }, u.head.account).expect(200);

      expect(h.dataOf<{ reserveConfirmation: Record<string, unknown> }>(response).reserveConfirmation).toMatchObject({
        result: 'BLOCKED',
        budgetOutcome: 'BLOCKED',
        blockedReasons: ['OVER_RESERVE'],
        confirmationKept: false,
      });
      expect(await h.steps(id, 'SPEND_APPROVAL')).toEqual([]);
      const kept = await h.ctx.sql.query(`SELECT 1 FROM request_reserve_confirmations WHERE request_id = $1`, [id]);
      expect(kept.rowCount).toBe(0);
    });

    it('BR-MF1-06h: refuses with 409 a request that is within the base or blocked: nothing waits for a confirmation', async () => {
      const u = await budgeted(10 * M);
      const within = await h.paidRequest(u, plan, { amount: 5 * M });
      await h.route(within, u.head.account);

      expect(h.codeOf(await h.confirmReserve(within, { reason: 'x' }, u.head.account).expect(409))).toBe(
        'SPEND.RESERVE_NOT_PENDING',
      );
      const never = await h.paidRequest(u, plan, { amount: 1 * M });
      expect(h.codeOf(await h.confirmReserve(never, { reason: 'x' }, u.head.account).expect(409))).toBe(
        'SPEND.RESERVE_NOT_PENDING',
      );
    });
  });
});
