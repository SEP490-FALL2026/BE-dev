import { RevocationHarness } from '../../support/revocation-harness';

const h = new RevocationHarness();

/**
 * G9-01 (`BR-MF1-09a`, `BR-MF1-09b`, F-012), real PostgreSQL: the outcome of a renewal recorded ahead of the next period. Until the next
 * period runs, the period that runs and the next one are one pool, and a seat carried to the next period takes its place from its first
 * day, as the database counts it (`license_assignments_seat_capacity`): an IT Admin can buy when the pool is full, and a next period still
 * a draft leaves the period that runs grantable.
 */
describe('G9-01 the shared pool between a renewal recorded and the next period (integration, real PostgreSQL)', () => {
  let counter = 0;
  const code = () => `E-NP-${(counter += 1)}`;
  let people: string[] = [];
  const person = (): string => people.shift() as string;

  /** The next period of `previousId`, written by SQL as the outcome of a renewal writes it (only a renewal may point back). */
  const nextPeriod = async (previousId: string, status: 'ACTIVE' | 'DRAFT', startDate: string): Promise<string> =>
    (
      await h.ctx.sql.query<{ id: string }>(
        `INSERT INTO subscriptions (id, organization_id, plan_id, owner_department_id, kind, status, purchased_quantity, unit_price_minor,
           unit_price_currency, price_recorded_on, price_rate, price_rate_date, price_rate_source, price_reporting_minor,
           price_reporting_currency, billing_cycle, commitment_term_months, start_date, responsible_it_admin_employee_id, auto_renew,
           allows_mid_term_reduction, renewed_from_id, updated_at)
         SELECT gen_random_uuid(), organization_id, plan_id, owner_department_id, kind, $2::"SubscriptionStatus", purchased_quantity,
                unit_price_minor, unit_price_currency, price_recorded_on, price_rate, price_rate_date, price_rate_source,
                price_reporting_minor, price_reporting_currency, billing_cycle, commitment_term_months, $3::date,
                responsible_it_admin_employee_id, auto_renew, allows_mid_term_reduction, id, now()
           FROM subscriptions WHERE id = $1
         RETURNING id`,
        [previousId, status, startDate],
      )
    ).rows[0].id;

  /** What `seats.carry` does: each seat of the period that runs continues on the next one from its first day, and ends that day. */
  const carry = async (previousId: string, nextId: string, startDate: string): Promise<void> => {
    await h.ctx.sql.query(
      `INSERT INTO license_assignments (id, organization_id, kind, source, plan_id, subscription_id, employee_id, account_identifier,
         normalized_account_identifier, reason, cost_center_id, owning_department_id, valid_from, valid_from_basis, valid_until,
         expected_end_date, predecessor_id, created_by_app_user_id)
       SELECT gen_random_uuid(), a.organization_id, a.kind, 'RENEWAL_CARRY', a.plan_id, $2::uuid, a.employee_id, a.account_identifier,
              a.normalized_account_identifier, a.reason, a.cost_center_id, a.owning_department_id, $3::date, 'RECORDED', NULL,
              a.expected_end_date, a.id, $4::uuid
         FROM license_assignments a
        WHERE a.subscription_id = $1 AND a.valid_until IS NULL
        ORDER BY a.valid_from, a.id`,
      [previousId, nextId, startDate, h.it1.appUserId],
    );
    await h.ctx.sql.query(
      `UPDATE license_assignments SET valid_until = $2::date WHERE subscription_id = $1 AND valid_until IS NULL`,
      [previousId, startDate],
    );
  };

  beforeAll(async () => {
    await h.start();
    people = [];
    for (let i = 0; i < 10; i += 1) people.push(await h.person(`E-NPX-${i}`));
  }, 300000);

  afterAll(async () => {
    await h.stop();
  });

  it('G9-01 a full pool whose seats were carried to a next period not started yet has no free seat: a grant buys, and one without a purchase is 409 SEAT_CAPACITY', async () => {
    const running = await h.subscription(2, 'K2');
    const planId = await h.planOf(running);
    await h.seat({ subscriptionId: running }, code());
    await h.seat({ subscriptionId: running }, code());
    const startsOn = h.inDays(30);
    const next = await nextPeriod(running, 'ACTIVE', startsOn);
    await carry(running, next, startsOn);

    const capacity = await h.grant({ requestId: h.gate.grantable(person(), planId) }).expect(409);
    expect(h.codeOf(capacity)).toBe('LICENSE_ASSIGNMENT.SEAT_CAPACITY');
    expect(h.detailsOf(capacity)).toEqual({ freeSeatsInPool: 0 });

    const bought = await h.grant({ requestId: h.gate.grantable(person(), planId), purchase: {} }).expect(201);
    expect(h.dataOf<{ task: { purchase: { kind: string } | null } }>(bought).task.purchase).toMatchObject({
      kind: 'POOL_TOP_UP',
    });
  });

  it('G9-01 a free seat of the next period is free in the pool even when its seats start later', async () => {
    const running = await h.subscription(1, 'K2');
    const planId = await h.planOf(running);
    await h.seat({ subscriptionId: running }, code());
    const startsOn = h.inDays(30);
    const next = await nextPeriod(running, 'ACTIVE', startsOn);
    await carry(running, next, startsOn);
    await h.ctx.sql.query(`UPDATE subscriptions SET purchased_quantity = 2 WHERE id = $1`, [next]);

    const refused = await h.grant({ requestId: h.gate.grantable(person(), planId), purchase: {} }).expect(409);
    expect(h.codeOf(refused)).toBe('PROVISIONING.PURCHASE_NOT_ALLOWED');
    expect(h.detailsOf(refused)).toMatchObject({ freeSeats: 1, subscriptionIds: [next] });
  });

  it('G9-05 a grant that names a period a next period that runs took over is 422 SUBSCRIPTION_NOT_GRANTABLE, and buys nothing on it', async () => {
    const running = await h.subscription(1, 'K2');
    const planId = await h.planOf(running);
    await h.seat({ subscriptionId: running }, code());
    const next = await nextPeriod(running, 'ACTIVE', h.today());
    await carry(running, next, h.today());

    const refused = await h
      .grant({ requestId: h.gate.grantable(person(), planId), subscriptionId: running, purchase: {} })
      .expect(422);

    expect(h.codeOf(refused)).toBe('PROVISIONING.SUBSCRIPTION_NOT_GRANTABLE');
    const { rows } = await h.ctx.sql.query<{ q: number }>(
      `SELECT purchased_quantity AS q FROM subscriptions WHERE id = $1`,
      [running],
    );
    expect(rows[0].q).toBe(1);
  });

  it('G9-01 (F-012) a next period still a draft leaves the period that runs grantable and pricing the plan', async () => {
    const running = await h.subscription(2, 'K2');
    const planId = await h.planOf(running);
    await h.seat({ subscriptionId: running }, code());
    await nextPeriod(running, 'DRAFT', h.inDays(30));

    const created = await h.grant({ requestId: h.gate.grantable(person(), planId) }).expect(201);

    const assignmentId = h.dataOf<{ task: { assignmentId: string } }>(created).task.assignmentId;
    const { rows } = await h.ctx.sql.query<{ subscription_id: string }>(
      `SELECT subscription_id FROM license_assignments WHERE id = $1`,
      [assignmentId],
    );
    expect(rows[0].subscription_id).toBe(running);
  });
});
