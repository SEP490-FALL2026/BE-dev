import { pretendBusinessToday } from '../../support/pretend-today';
import { ProvisioningHarness } from '../../support/provisioning-harness';

const h = new ProvisioningHarness();

/**
 * `BR-MF1-09c` / R-E06 / `QĐ-106e` / `QĐ-108d`, real PostgreSQL: a grant taken from a free seat of the pool records the cost it avoided once,
 * when its task is completed; a grant with a purchase records nothing. Also what the request is told of the grant (`facts`, spec §7), and
 * that a K1 grant buys its own seat and that a grant with no subscription named takes the primary one of the plan (`P0-05`, `S1-04`).
 */
describe('the cost avoided by a grant from the pool, and the grant that names no subscription (integration, real PostgreSQL)', () => {
  let counter = 0;
  const person = () => h.person(`E-AV-${(counter += 1)}`);
  const avoided = async (taskId: string) =>
    (
      await h.ctx.sql.query<{
        provisioning_type: string;
        months: number | null;
        unit_minor: string;
        amount_minor: string;
        currency: string;
      }>(
        `SELECT provisioning_type, months, unit_minor::text, amount_minor::text, currency
           FROM pool_grant_avoided_costs WHERE provisioning_task_id = $1`,
        [taskId],
      )
    ).rows;
  const worked = async (taskId: string) => {
    await h.claim(taskId).expect(200);
    await h.complete(taskId, { evidence: 'done' }).expect(200);
  };
  const quantityOf = async (id: string) =>
    (await h.ctx.sql.query<{ q: number }>(`SELECT purchased_quantity AS q FROM subscriptions WHERE id = $1`, [id]))
      .rows[0].q;

  beforeAll(async () => {
    await h.start();
  }, 240000);

  afterAll(async () => {
    jest.restoreAllMocks();
    await h.stop();
  });

  it('R-E06 K2: a grant completed on 14/07 at a monthly price of 15 records 6 months and 90; the commitments are not touched', async () => {
    const subscriptionId = await h.subscription(3, 'K2');
    // The price in VND and its reporting snapshot (VND as well) move together: the cost avoided reads the reporting price.
    await h.ctx.sql.query(
      `UPDATE subscriptions SET unit_price_minor = 1500,
         price_reporting_minor = CASE WHEN price_reporting_minor IS NULL THEN NULL ELSE 1500 END WHERE id = $1`,
      [subscriptionId],
    );
    const planId = await h.planOf(subscriptionId);
    const task = await h.granted(await person(), planId, { subscriptionId });
    const commitmentsBefore = await h.count('budget_commitments');
    const spy = pretendBusinessToday(h.ctx.app, '2026-07-14');

    await worked(task.id);
    spy.mockRestore();

    expect(await avoided(task.id)).toEqual([
      { provisioning_type: 'K2', months: 6, unit_minor: '1500', amount_minor: '9000', currency: 'VND' },
    ]);
    expect(await h.count('budget_commitments')).toBe(commitmentsBefore);
  });

  it('R-E06: nothing is recorded for a grant with a purchase, and a second completion does not record again', async () => {
    const subscriptionId = await h.subscription(1, 'K2');
    const planId = await h.planOf(subscriptionId);
    const first = await h.granted(await person(), planId, { subscriptionId });
    const bought = h.dataOf<{ task: { id: string } }>(
      await h.grant({ requestId: h.gate.grantable(await person(), planId), subscriptionId, purchase: {} }).expect(201),
    ).task;

    await worked(first.id);
    await worked(bought.id);
    await h.complete(first.id, { evidence: 'again' });

    expect(await avoided(first.id)).toHaveLength(1);
    expect(await avoided(bought.id)).toEqual([]);
  });

  it('R-E06: a K1 grant is not from the pool, so nothing is recorded', async () => {
    const subscriptionId = await h.subscription(5, 'K1');
    const task = await h.granted(await person(), await h.planOf(subscriptionId), { subscriptionId });

    await worked(task.id);

    expect(await avoided(task.id)).toEqual([]);
  });

  it('S1-04: a K1 grant buys its own seat in the same transaction, with no department asked', async () => {
    const subscriptionId = await h.subscription(5, 'K1');
    const planId = await h.planOf(subscriptionId);

    await h.granted(await person(), planId, { subscriptionId });
    await h.granted(await person(), planId);

    // Each grant took one more seat than it found: the quantity is 5 + 2 and the seats in use are 2.
    expect(await quantityOf(subscriptionId)).toBe(7);
  });

  it('P0-05: with no subscription named, the grant takes the primary subscription of the plan, else the one with a free seat', async () => {
    const planId = await h.plan('K2');
    const declare = async (quantity: number, price: string) =>
      (
        await h.ctx.sql.query<{ id: string }>(
          `INSERT INTO subscriptions (id, organization_id, plan_id, owner_department_id, kind, status, purchased_quantity,
             unit_price_minor, unit_price_currency, price_recorded_on, billing_cycle, commitment_term_months, start_date,
             responsible_it_admin_employee_id, updated_at, price_rate, price_rate_date, price_rate_source, price_reporting_minor, price_reporting_currency)
           SELECT gen_random_uuid(), s.organization_id, $1, s.owner_department_id, 'TERM', 'ACTIVE', $2, $3::bigint, 'VND', '2026-01-05',
                  'MONTHLY', 1, '2026-01-05', s.responsible_it_admin_employee_id, now(), s.price_rate, s.price_rate_date,
                  s.price_rate_source, $3::bigint, s.price_reporting_currency
             FROM subscriptions s WHERE s.id = (SELECT id FROM subscriptions WHERE price_rate IS NOT NULL LIMIT 1)
           RETURNING id`,
          [planId, quantity, price],
        )
      ).rows[0].id;
    // The reporting price is the one the plan is priced by: each declares its own, or the two tie and only the id decides.
    const cheap = await declare(1, '100');
    const dear = await declare(1, '900');

    // No flag: the dearest a month is the one that prices the plan, so the grant takes it; it is then full, so the next takes the other.
    const first = await h.granted(await person(), planId);
    const second = await h.granted(await person(), planId);

    expect(first.subscriptionId).toBe(dear);
    expect(second.subscriptionId).toBe(cheap);

    await h.ctx.sql.query(`UPDATE subscriptions SET is_primary_for_plan = true WHERE id = $1`, [cheap]);
    await h.ctx.sql.query(`UPDATE subscriptions SET purchased_quantity = 2 WHERE id IN ($1, $2)`, [cheap, dear]);
    // The primary one first when it has room.
    expect((await h.granted(await person(), planId)).subscriptionId).toBe(cheap);
  });
});
