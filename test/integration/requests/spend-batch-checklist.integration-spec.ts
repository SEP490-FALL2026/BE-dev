import { GroupHarness } from '../../support/group-harness';
import type { Unit } from '../../support/spend-harness';

const h = new GroupHarness();
const M = 1_000_000;

interface ResultWire {
  requestId: string;
  outcome: string;
  reserveConfirmation?: string;
  reason?: string | null;
}

/**
 * The checklist of the reserve (`QĐ-111ap`, `QĐ-111aq`, `QĐ-111be`) over real PostgreSQL: the head who confirms the reserve in the act of sending a
 * batch answers the step 1.6 once for the batch, and an answer No refuses the whole batch, so nothing of the reserve is confirmed.
 */
describe('the checklist of the reserve confirmed in a batch (integration, real PostgreSQL)', () => {
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

  /** Base 100, reserve 10, 20 held and 40 spent: 40 left of the base and 50 with the reserve (millions). */
  const unit = async (): Promise<{ u: Unit; versionId: string }> => {
    counter += 1;
    const u = await h.departmentWithHead(`P-BC${counter}`);
    const version = await h.budgetFor(u, { total: 100 * M, reserve: 10 * M, held: 20 * M, spent: 40 * M });

    return { u, versionId: version.id };
  };
  const confirmationsOf = async (requestId: string) =>
    (await h.ctx.sql.query(`SELECT 1 FROM request_reserve_confirmations WHERE request_id = $1`, [requestId])).rowCount;
  const checklistsOf = (id: string, step: string) =>
    h.ctx.sql
      .query<{ decision: string; has_no: boolean; line_employee_id: string | null; policy_version_id: string }>(
        `SELECT decision, has_no, line_employee_id, policy_version_id FROM decision_checklists
          WHERE subject_id = $1 AND step_code = $2 ORDER BY decided_at, line_employee_id`,
        [id, step],
      )
      .then((result) => result.rows);
  const batchCount = async () => (await h.ctx.sql.query(`SELECT 1 FROM spend_batches`)).rowCount;
  const noCodesOf = (response: { body: unknown }) =>
    (response.body as { error: { details: { items: { code: string }[] } } }).error.details.items.map(
      (item) => item.code,
    );
  const results = (response: { body: unknown }) => h.dataOf<{ results: ResultWire[] }>(response as never).results;

  describe('the reserve confirmed in the act of sending a batch (step 1.6)', () => {
    it('asks the checklist of the step when the batch carries a confirmation, and writes nothing without it', async () => {
      const { u } = await unit();
      const reserve = await h.paidRequest(u, plan, { amount: 45 * M });
      const before = await batchCount();

      const response = await h
        .sendOn([reserve], u.head.account, [{ requestId: reserve, reason: 'Cần cho dự án' }], null)
        .expect(422);

      expect(h.codeOf(response)).toBe('VALIDATION_ERROR');
      expect(await batchCount()).toBe(before);
      expect(await confirmationsOf(reserve)).toBe(0);
      expect(await h.state(reserve)).toBe('AWAITING_SPEND_SUBMISSION');
    });

    it('asks for an answer to every question of the step', async () => {
      const { u } = await unit();
      const reserve = await h.paidRequest(u, plan, { amount: 45 * M });
      const yes = h.checklists.yes('1.6');

      const response = await h
        .sendOn([reserve], u.head.account, [{ requestId: reserve, reason: 'Cần cho dự án' }], { ...yes, answers: [] })
        .expect(422);

      expect(h.codeOf(response)).toBe('POLICY.CHECKLIST_INCOMPLETE');
      expect(await confirmationsOf(reserve)).toBe(0);
    });

    it('needs no checklist for a batch that carries no confirmation', async () => {
      const { u } = await unit();
      const within = await h.paidRequest(u, plan, { amount: 5 * M });

      await h.sendOn([within], u.head.account).expect(201);

      expect(await h.state(within)).toBe('AWAITING_SPEND_DECISION');
      expect(await checklistsOf(within, '1.6')).toEqual([]);
    });

    it('refuses the whole batch when an answer is No: no confirmation, no batch, no answers kept, and every request stays in the queue of the head', async () => {
      const { u } = await unit();
      const within = await h.paidRequest(u, plan, { amount: 5 * M });
      const reserve = await h.paidRequest(u, plan, { amount: 45 * M });
      const before = await batchCount();
      const no = h.checklists.questionsOf('1.6')[0];

      const response = await h
        .sendOn(
          [within, reserve],
          u.head.account,
          [{ requestId: reserve, reason: 'Cần cho dự án' }],
          h.checklists.answer('1.6', [no]),
        )
        .expect(422);

      expect(h.codeOf(response)).toBe('POLICY.CHECKLIST_HAS_NO');
      expect(noCodesOf(response)).toEqual([no]);
      expect(await batchCount()).toBe(before);
      expect(await confirmationsOf(reserve)).toBe(0);
      expect(await h.steps(reserve, 'SPEND_APPROVAL')).toEqual([]);
      expect([await h.state(within), await h.state(reserve)]).toEqual([
        'AWAITING_SPEND_SUBMISSION',
        'AWAITING_SPEND_SUBMISSION',
      ]);
      expect(await checklistsOf(reserve, '1.6')).toEqual([]);
      expect(await checklistsOf(within, '1.6')).toEqual([]);
    });

    it('keeps the answers once for each request whose confirmation was applied, and none for one that was ignored', async () => {
      const { u } = await unit();
      const within = await h.paidRequest(u, plan, { amount: 5 * M });
      const reserve = await h.paidRequest(u, plan, { amount: 45 * M });

      const response = await h
        .sendOn([within, reserve], u.head.account, [
          { requestId: reserve, reason: 'Cần cho dự án' },
          { requestId: within, reason: 'Không cần' },
        ])
        .expect(201);

      expect(results(response).map((item) => [item.requestId, item.reserveConfirmation])).toEqual([
        [within, 'IGNORED'],
        [reserve, 'APPLIED'],
      ]);
      expect(await checklistsOf(reserve, '1.6')).toEqual([
        {
          decision: 'CONFIRM',
          has_no: false,
          line_employee_id: null,
          policy_version_id: h.checklists.yes('1.6').policyVersionId,
        },
      ]);
      expect(await checklistsOf(within, '1.6')).toEqual([]);
    });

    it('keeps one set of answers for each request confirmed, the same answers in each', async () => {
      const { u } = await unit();
      const first = await h.paidRequest(u, plan, { amount: 41 * M });
      const second = await h.paidRequest(u, plan, { amount: 3 * M });

      const response = await h
        .sendOn([first, second], u.head.account, [
          { requestId: first, reason: 'Một' },
          { requestId: second, reason: 'Hai' },
        ])
        .expect(201);

      expect(results(response).map((item) => item.reserveConfirmation)).toEqual(['APPLIED', 'APPLIED']);
      expect(await checklistsOf(first, '1.6')).toHaveLength(1);
      expect(await checklistsOf(second, '1.6')).toHaveLength(1);
    });
  });

  describe('the reserve confirmed on its own route (step 1.6)', () => {
    /** A request that uses the reserve, sent on without a line of reason: it waits in the queue of its head. */
    const usingReserve = async (u: Unit): Promise<string> => {
      const id = await h.paidRequest(u, plan, { amount: 45 * M });
      const [item] = results(await h.sendOn([id], u.head.account).expect(201));
      expect(item.outcome).toBe('AWAITING_RESERVE_CONFIRMATION');

      return id;
    };

    it('locks the confirmation when an answer is No: the request stays in the queue of the head, nothing is confirmed and no answer is kept', async () => {
      const { u } = await unit();
      const id = await usingReserve(u);
      const no = h.checklists.questionsOf('1.6')[0];

      const response = await h
        .confirmReserve(id, { reason: 'Gấp', checklist: h.checklists.answer('1.6', [no]) }, u.head.account)
        .expect(422);

      expect(h.codeOf(response)).toBe('POLICY.CHECKLIST_HAS_NO');
      expect(await confirmationsOf(id)).toBe(0);
      expect(await h.steps(id, 'SPEND_APPROVAL')).toEqual([]);
      expect(await h.state(id)).toBe('AWAITING_SPEND_SUBMISSION');
      expect(await checklistsOf(id, '1.6')).toEqual([]);
    });

    it('keeps the answers with the confirmation that was kept', async () => {
      const { u } = await unit();
      const id = await usingReserve(u);

      await h.confirmReserve(id, { reason: 'Gấp' }, u.head.account).expect(200);

      expect(await checklistsOf(id, '1.6')).toEqual([expect.objectContaining({ decision: 'CONFIRM', has_no: false })]);
    });

    it('keeps no answer when the check made again blocks the request: nothing was confirmed', async () => {
      const { u, versionId } = await unit();
      const id = await usingReserve(u);
      await h.commit(u, versionId, h.year, 30 * M, 'HELD');

      const response = await h.confirmReserve(id, { reason: 'Gấp' }, u.head.account).expect(200);

      expect(
        h.dataOf<{ reserveConfirmation: { confirmationKept: boolean } }>(response).reserveConfirmation,
      ).toMatchObject({ confirmationKept: false });
      expect(await confirmationsOf(id)).toBe(0);
      expect(await checklistsOf(id, '1.6')).toEqual([]);
    });
  });
});
