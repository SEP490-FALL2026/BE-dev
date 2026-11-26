import request from 'supertest';
import { SpendHarness, Unit } from '../../support/spend-harness';

const h = new SpendHarness();
const M = 1_000_000;

/**
 * `BR-MF1-09`, `QĐ-106d`, `FR-5.8`(2), real PostgreSQL (spec `qd103-k4-key-pool` §3): the request of a K4 key holds the purchase price; when
 * the IT Admin gives a free key of the pool, nothing is bought, so all that was held goes back to the budget in the transaction that
 * completes the task (`GRANTED_FROM_POOL`). A K4 grant that bought its key keeps its commitment until the invoice, and a K2 seat from the
 * pool is not released by this rule.
 */
describe('BR-MF1-09: the commitment of a K4 request granted from the key pool (integration, real PostgreSQL)', () => {
  let counter = 0;
  let batch = 0;

  beforeAll(async () => {
    await h.start();
    await h.withApprover();
  }, 240000);

  afterAll(async () => {
    await h.stop();
  });

  /** A K4 purchase of a new plan whose vendor has a tax profile, with `keys` keys in its store. */
  const k4Pool = async (quantity: number, keys: number) => {
    const subscriptionId = await h.subscription(quantity, 'K4');
    const planId = await h.planOf(subscriptionId);
    await h
      .declareTaxProfile((await h.vendorOf(planId)).id, [{ taxType: 'GTGT', ratePercent: '10', deductible: true }])
      .expect(200);
    if (keys > 0) await importKeys(subscriptionId, keys);

    return { subscriptionId, planId };
  };
  const importKeys = async (subscriptionId: string, count: number) => {
    batch += 1;
    const keys = Array.from({ length: count }, (_, i) => `K4C-${batch}-${String(i + 1).padStart(3, '0')}-ABCDE-12345`);
    await request(h.server())
      .post('/api/v1/license-keys/imports')
      .set(h.as(h.it1))
      .send({ subscriptionId, keys })
      .expect(201);
  };
  const freeKey = async (subscriptionId: string): Promise<string> =>
    (
      await h.ctx.sql.query<{ id: string }>(
        `SELECT id FROM license_keys WHERE subscription_id = $1 AND status = 'IN_STORE' AND withdrawn_at IS NULL
          ORDER BY imported_at, id LIMIT 1`,
        [subscriptionId],
      )
    ).rows[0].id;
  /** A department with a budget of 100 million, and a request of `amount` for the plan approved for spending. */
  const approved = async (planId: string, amount: number): Promise<string> => {
    counter += 1;
    const u: Unit = await h.departmentWithHead(`P-K4C${counter}`);
    await h.budgetFor(u, { total: 100 * M, held: 0, spent: 0 });
    const id = await h.waitingForApprover(u, planId, { amount });
    await h.decideSpend(id, { decision: 'APPROVE' }, h.boss.account).expect(200);

    return id;
  };
  const commitmentOf = async (requestId: string) =>
    (
      await h.ctx.sql.query<{ state: string; amount_minor: string; released_minor: string }>(
        `SELECT state, amount_minor::text, released_minor::text FROM budget_commitments WHERE request_id = $1`,
        [requestId],
      )
    ).rows;
  const releasesOf = async (requestId: string) =>
    (
      await h.ctx.sql.query<{ reason: string; amount_minor: string; released_by_employee_id: string | null }>(
        `SELECT r.reason::text, r.amount_minor::text, r.released_by_employee_id
           FROM budget_commitment_releases r JOIN budget_commitments c ON c.id = r.commitment_id
          WHERE c.request_id = $1 ORDER BY r.released_at`,
        [requestId],
      )
    ).rows;
  const carriedOut = async (requestId: string, body: object, licenseKeyId: () => Promise<string>) => {
    const task = h.dataOf<{ task: { id: string } }>(await h.grant({ requestId, ...body }).expect(201)).task;
    await h.claim(task.id).expect(200);
    await h.complete(task.id, { evidence: 'Key activated', licenseKeyId: await licenseKeyId() }).expect(200);
  };

  it('BR-MF1-09 (QĐ-106d): a K4 key given from the pool releases all that was held for the request, by the system', async () => {
    const { subscriptionId, planId } = await k4Pool(3, 2);
    const id = await approved(planId, 25 * M);
    expect(await commitmentOf(id)).toEqual([
      expect.objectContaining({ state: 'HELD', amount_minor: String(25 * M), released_minor: '0' }),
    ]);

    await carriedOut(id, { subscriptionId }, () => freeKey(subscriptionId));

    expect(await h.state(id)).toBe('COMPLETED');
    expect(await commitmentOf(id)).toEqual([
      expect.objectContaining({ state: 'RELEASED', released_minor: String(25 * M) }),
    ]);
    expect(await releasesOf(id)).toEqual([
      { reason: 'GRANTED_FROM_POOL', amount_minor: String(25 * M), released_by_employee_id: null },
    ]);
  });

  it('BR-MF1-09: a K4 grant that bought its key keeps its commitment until the invoice', async () => {
    const { subscriptionId, planId } = await k4Pool(1, 0);
    const id = await approved(planId, 25 * M);

    await carriedOut(id, { subscriptionId, purchase: { reason: 'Pool empty' } }, async () => {
      await importKeys(subscriptionId, 1);

      return freeKey(subscriptionId);
    });

    expect(await h.state(id)).toBe('COMPLETED');
    expect(await commitmentOf(id)).toEqual([expect.objectContaining({ state: 'HELD', released_minor: '0' })]);
    expect(await releasesOf(id)).toEqual([]);
  });

  it('BR-MF1-09: a K2 seat from the pool is not released by the rule of K4', async () => {
    const subscriptionId = await h.subscription(10);
    const planId = await h.planOf(subscriptionId);
    await h
      .declareTaxProfile((await h.vendorOf(planId)).id, [{ taxType: 'GTGT', ratePercent: '10', deductible: true }])
      .expect(200);
    const id = await approved(planId, 15 * M);
    const task = h.dataOf<{ task: { id: string } }>(await h.grant({ requestId: id, subscriptionId }).expect(201)).task;
    await h.claim(task.id).expect(200);

    await h.complete(task.id, { evidence: 'done' }).expect(200);

    expect((await releasesOf(id)).filter((row) => row.reason === 'GRANTED_FROM_POOL')).toEqual([]);
  });

  it('F-17: refuses named K4 REQUEST lot reserved for another request (409 LICENSE_LOT.RESERVED_FOR_REQUEST) and lets grant with purchase proceed (201)', async () => {
    const { planId } = await k4Pool(1, 0);
    counter += 1;
    const u = await h.departmentWithHead(`P-K4C${counter}`);
    await h.budgetFor(u, { total: 200 * M, held: 0, spent: 0 });
    const p2 = await h.staff(u.department, `K4C-P2-${counter}`);

    const reqDuc = await h.sentForPeople(planId, [u.member, p2], u.head.account, { termMonths: undefined });
    await h.setPayments(reqDuc, { amount: 24 * M });
    await h.sendOn([reqDuc], u.head.account).expect(201);
    await h.decideSpend(reqDuc, { decision: 'APPROVE' }, h.boss.account).expect(200);

    await h
      .grant({ requestId: reqDuc, beneficiaryEmployeeId: u.member.employeeId, purchase: { reason: 'Buy Duc lot' } })
      .expect(201);

    const lotDucId = h.dataOf<{ id: string }>(
      await request(h.server())
        .post('/api/v1/license-lots')
        .set(h.as(h.it1))
        .send({
          planId,
          purchasedOn: h.today(),
          licenseCount: 2,
          unitPrice: { amount: '12000000', currency: 'VND' },
          purpose: 'REQUEST',
          requestId: reqDuc,
        })
        .expect(201),
    ).id;
    batch += 1;
    await request(h.server())
      .post(`/api/v1/license-lots/${lotDucId}/keys`)
      .set(h.as(h.it1))
      .send({
        keys: [`K4C-${batch}-001-ABCDE-12345`, `K4C-${batch}-002-ABCDE-12345`],
      })
      .expect(201);

    const reqMinh = await approved(planId, 12 * M);
    const namedRefused = await h.grant({ requestId: reqMinh, subscriptionId: lotDucId }).expect(409);
    expect(h.codeOf(namedRefused)).toBe('LICENSE_LOT.RESERVED_FOR_REQUEST');

    const withPurchase = await h
      .grant({ requestId: reqMinh, purchase: { reason: 'Reserved for Duc request lot' } })
      .expect(201);
    expect(h.dataOf<{ task: { purchase: { kind: string } | null } }>(withPurchase).task.purchase).toMatchObject({
      kind: 'KEY_PURCHASE',
    });
  });
});
