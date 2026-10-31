import { SpendHarness, Unit } from '../../support/spend-harness';

const h = new SpendHarness();
const M = 1_000_000;

interface ResultWire {
  requestId: string;
  outcome: string;
  reason: string | null;
}

describe('the decision of the requests of a batch over PostgreSQL (US-06-01 AC-19, AC-20)', () => {
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

  /** A department with a budget of its own, so that what one test commits does not meet the next. */
  const fresh = async (): Promise<{ design: Unit; versionId: string }> => {
    counter += 1;
    const design = await h.departmentWithHead(`P-B${counter}`);

    return { design, versionId: (await h.budgetFor(design, { total: 1000 * M, percent: 50 })).id };
  };
  const sendAll = async (design: Unit, amounts: number[]) => {
    const ids: string[] = [];
    for (const amount of amounts) ids.push(await h.paidRequest(design, plan, { amount }));
    const batch = h.dataOf<{ batch: { id: string } }>(await h.sendOn(ids, design.head.account).expect(201)).batch;

    return { ids, batchId: batch.id };
  };
  const decideAll = async (batchId: string, body: object, account = h.boss.account) =>
    h.dataOf<{ results: ResultWire[] }>(await h.decideBatch(batchId, body, account).expect(200)).results;
  const records = async (ids: string[]) =>
    (
      await h.ctx.sql.query<{ request_id: string; decision: string; reason: string | null }>(
        `SELECT r.request_id, r.decision, r.reason FROM approval_records r JOIN access_request_steps s ON s.id = r.step_id
          WHERE s.kind = 'SPEND_APPROVAL' AND r.request_id = ANY($1::uuid[]) ORDER BY r.decided_at`,
        [ids],
      )
    ).rows;

  describe('approving together (AC-19)', () => {
    it('decides each request on its own, in order, and skips the one with no step, the one withdrawn and the one that waits for Finance', async () => {
      const { design } = await fresh();
      const { ids, batchId } = await sendAll(design, [10 * M, 10 * M, 10 * M, 900 * M]);
      const [first, second, withdrawn, big] = ids;
      // The effect of a withdrawal on the step of its request (the item that withdraws makes it): the step is closed.
      await h.ctx.sql.query(
        `UPDATE access_request_steps SET state = 'CLOSED', decided_at = now() WHERE request_id = $1 AND kind = 'SPEND_APPROVAL'`,
        [withdrawn],
      );

      const results = await decideAll(batchId, { decision: 'APPROVE', requestIds: ids });

      expect(results).toEqual([
        { requestId: first, outcome: 'APPROVED', reason: null },
        { requestId: second, outcome: 'APPROVED', reason: null },
        { requestId: withdrawn, outcome: 'SKIPPED', reason: 'NO_SPEND_STEP' },
        { requestId: big, outcome: 'SKIPPED', reason: 'NO_SPEND_STEP' },
      ]);
      expect((await records(ids)).map((record) => [record.request_id, record.decision])).toEqual([
        [first, 'APPROVED'],
        [second, 'APPROVED'],
      ]);
      expect(await h.state(first)).toBe('AWAITING_EXECUTION');
      // The one that waits for Finance stays in its batch and with Finance.
      expect(await h.state(big)).toBe('AWAITING_FINANCE_REVIEW');
      const left = await h.ctx.sql.query(
        `SELECT 1 FROM spend_batch_items WHERE request_id = $1 AND left_reason IS NOT NULL`,
        [big],
      );
      expect(left.rowCount).toBe(0);
    });

    it('has no decision of its own: the batch stays as the envelope it was', async () => {
      const { design } = await fresh();
      const { ids, batchId } = await sendAll(design, [10 * M, 10 * M]);
      const before = await h.batchOf(batchId, design.head.account).expect(200);

      await decideAll(batchId, { decision: 'APPROVE', requestIds: ids });

      const after = await h.batchOf(batchId, design.head.account).expect(200);
      expect(after.body).toEqual(before.body);
    });

    it('does not give an override in bulk: a request that needs one is skipped and left as it was', async () => {
      const { design, versionId } = await fresh();
      const { ids, batchId } = await sendAll(design, [10 * M, 600 * M]);
      const [ok, over] = ids;
      // 600 million is 60 % of what is left: a high value, which Finance reviews, and then it waits for the approver.
      await h
        .completeReview(over, { outcome: 'ASSESSED', opinion: 'Reviewed', direction: 'RECOMMEND_APPROVE' })
        .expect(200);
      // Money was committed since: the reviewed request costs more than is left, and the other is now an exception no one reviewed.
      await h.commit(design, versionId, h.year, 995 * M, 'HELD');

      const results = await decideAll(batchId, { decision: 'APPROVE', requestIds: [over, ok] });

      expect(results).toEqual([
        { requestId: over, outcome: 'SKIPPED', reason: 'OVERRIDE_REQUIRED' },
        { requestId: ok, outcome: 'SKIPPED', reason: 'RECHECKED_NEEDS_FINANCE_REVIEW' },
      ]);
      expect(await records(ids)).toEqual([]);
      expect(await h.state(over)).toBe('AWAITING_SPEND_DECISION');
      expect(await h.state(ok)).toBe('AWAITING_FINANCE_REVIEW');
    });

    it('skips a request that is not in the batch, and answers 404 for a batch the caller holds nothing of', async () => {
      const { design } = await fresh();
      const { ids, batchId } = await sendAll(design, [10 * M]);
      const stranger = await h.waitingForApprover(design, plan, { amount: 10 * M });

      const results = await decideAll(batchId, { decision: 'APPROVE', requestIds: [stranger, ids[0]] });

      expect(results).toEqual([
        { requestId: stranger, outcome: 'SKIPPED', reason: 'NOT_IN_BATCH' },
        { requestId: ids[0], outcome: 'APPROVED', reason: null },
      ]);
      await h.decideBatch(batchId, { decision: 'APPROVE', requestIds: ids }, design.head.account).expect(404);
      await h.decideBatch(batchId, { decision: 'APPROVE', requestIds: ids }, h.finance).expect(404);
    });

    it.each([
      ['no request', { decision: 'APPROVE', requestIds: [] }],
      [
        'a request named twice',
        {
          decision: 'APPROVE',
          requestIds: ['00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001'],
        },
      ],
      [
        'a reason with an approval',
        { decision: 'APPROVE', requestIds: ['00000000-0000-4000-8000-000000000001'], reason: 'No' },
      ],
    ])('is not asked with %s', async (_name, body) => {
      const { design } = await fresh();
      const { batchId } = await sendAll(design, [10 * M]);

      const response = await h.decideBatch(batchId, body, h.boss.account).expect(422);

      expect(h.codeOf(response)).toBe('VALIDATION_ERROR');
    });
  });

  describe('refusing together (AC-20)', () => {
    it('keeps the one reason for each request, ends each as refused, and writes a record of its own', async () => {
      const { design } = await fresh();
      const { ids, batchId } = await sendAll(design, [10 * M, 10 * M]);

      const results = await decideAll(batchId, {
        decision: 'REJECT',
        requestIds: ids,
        reason: 'Postponed to next quarter',
      });

      expect(results.map((result) => result.outcome)).toEqual(['REJECTED', 'REJECTED']);
      expect(await records(ids)).toEqual([
        expect.objectContaining({ decision: 'REJECTED', reason: 'Postponed to next quarter' }),
        expect.objectContaining({ decision: 'REJECTED', reason: 'Postponed to next quarter' }),
      ]);
      for (const id of ids) expect(await h.state(id)).toBe('REJECTED');
    });

    it('is not saved without its reason', async () => {
      const { design } = await fresh();
      const { ids, batchId } = await sendAll(design, [10 * M]);

      const missing = await h.decideBatch(batchId, { decision: 'REJECT', requestIds: ids }, h.boss.account).expect(422);

      expect(h.codeOf(missing)).toBe('VALIDATION_ERROR');
      expect(await h.state(ids[0])).toBe('AWAITING_SPEND_DECISION');
    });
  });
});
