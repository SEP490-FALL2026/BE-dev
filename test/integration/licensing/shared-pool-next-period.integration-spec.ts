import type { ApiAccount } from '../../support/api-accounts';
import { buildActivatedAccount } from '../../support/builders/account.builder';
import { RevocationHarness } from '../../support/revocation-harness';
import { takeOwnerOff } from '../../support/shared-pool-subscription';
import { carry, nextPeriod } from '../../support/subscription-periods';

const h = new RevocationHarness();

/**
 * G9-01 (`BR-MF1-09a`, `BR-MF1-09b`, F-012), real PostgreSQL: the outcome of a renewal recorded ahead of the next period. Until the next
 * period runs, the period that runs and the next one are one pool, and a seat carried to the next period takes its place from its first
 * day, as the database counts it (`license_assignments_seat_capacity`): an IT Admin can buy when the pool is full, and a next period still
 * a draft leaves the period that runs grantable. The seats carried to the next period are the seats of the period that runs, so the pool counts them once
 * (`B2B-02`, `QĐ-111n`).
 */
describe('G9-01 the shared pool between a renewal recorded and the next period (integration, real PostgreSQL)', () => {
  let counter = 0;
  const code = () => `E-NP-${(counter += 1)}`;
  let people: string[] = [];
  let answering: ApiAccount;
  const person = (): string => people.shift() as string;

  beforeAll(async () => {
    await h.start();
    people = [];
    for (let i = 0; i < 16; i += 1) people.push(await h.person(`E-NPX-${i}`));
    answering = await buildActivatedAccount(h.ctx, h.seed, {
      code: 'E-IT-NP',
      email: 'it-np@acme.vn',
      role: 'IT_ADMIN',
    });
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
    const next = await nextPeriod(h, running, 'ACTIVE', startsOn);
    await carry(h, running, next, startsOn);

    const capacity = await h.grant({ requestId: h.gate.grantable(person(), planId) }).expect(409);
    expect(h.codeOf(capacity)).toBe('LICENSE_ASSIGNMENT.SEAT_CAPACITY');
    expect(h.detailsOf(capacity)).toEqual({ freeSeatsInPool: 0 });

    // The seat it buys goes on into the next period (FX2-R1): one that buys no seat for it refuses the grant, so it is sized for it first.
    const short = await h.grant({ requestId: h.gate.grantable(person(), planId), purchase: {} }).expect(422);
    expect(h.codeOf(short)).toBe('PROVISIONING.SUBSCRIPTION_NEXT_PERIOD_SEATS');
    await sizeNext(next, 3);
    const bought = await h.grant({ requestId: h.gate.grantable(person(), planId), purchase: {} }).expect(201);
    expect(h.dataOf<{ task: { purchase: { kind: string } | null } }>(bought).task.purchase).toMatchObject({
      kind: 'POOL_TOP_UP',
    });
  });

  it('B2B-02 the seats carried to a next period not started yet are the same seats: ten seats and four people leave six free, not twelve', async () => {
    const running = await h.subscription(10, 'K2');
    const planId = await h.planOf(running);
    for (let index = 0; index < 4; index += 1) await h.seat({ subscriptionId: running }, code());
    const startsOn = h.inDays(30);
    const next = await nextPeriod(h, running, 'ACTIVE', startsOn);
    await carry(h, running, next, startsOn);

    const refused = await h.grant({ requestId: h.gate.grantable(person(), planId), purchase: {} }).expect(409);

    expect(h.codeOf(refused)).toBe('PROVISIONING.PURCHASE_NOT_ALLOWED');
    expect(h.detailsOf(refused)).toMatchObject({ freeSeats: 6, subscriptionIds: [running] });
  });

  it('B2B-02 the next period adds no seat to give before it runs: an extra seat it bought is not free today, so a grant that buys is recorded on the period that runs', async () => {
    const running = await h.subscription(1, 'K2');
    const planId = await h.planOf(running);
    await h.seat({ subscriptionId: running }, code());
    const startsOn = h.inDays(30);
    const next = await nextPeriod(h, running, 'ACTIVE', startsOn);
    await carry(h, running, next, startsOn);
    await h.ctx.sql.query(`UPDATE subscriptions SET purchased_quantity = 2 WHERE id = $1`, [next]);

    const bought = await h.grant({ requestId: h.gate.grantable(person(), planId), purchase: {} }).expect(201);

    const task = h.dataOf<{ task: { assignmentId: string; purchase: { kind: string } | null } }>(bought).task;
    expect(task.purchase).toMatchObject({ kind: 'POOL_TOP_UP' });
    const { rows } = await h.ctx.sql.query<{ subscription_id: string }>(
      `SELECT subscription_id FROM license_assignments WHERE id = $1`,
      [task.assignmentId],
    );
    expect(rows[0].subscription_id).toBe(running);
  });

  it('G9-05 a grant that names a period a next period that runs took over is 422 SUBSCRIPTION_NOT_GRANTABLE, and buys nothing on it', async () => {
    const running = await h.subscription(1, 'K2');
    const planId = await h.planOf(running);
    await h.seat({ subscriptionId: running }, code());
    const next = await nextPeriod(h, running, 'ACTIVE', h.today());
    await carry(h, running, next, h.today());

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

  it('B2B-02 a grant that names a next period not started yet is 422 SUBSCRIPTION_NOT_GRANTABLE: the seat is taken on the period that runs, and nothing is bought on either', async () => {
    const running = await h.subscription(2, 'K2');
    const planId = await h.planOf(running);
    await h.seat({ subscriptionId: running }, code());
    const startsOn = h.inDays(30);
    const next = await nextPeriod(h, running, 'ACTIVE', startsOn);
    await carry(h, running, next, startsOn);

    const refused = await h
      .grant({ requestId: h.gate.grantable(person(), planId), subscriptionId: next, purchase: {} })
      .expect(422);

    expect(h.codeOf(refused)).toBe('PROVISIONING.SUBSCRIPTION_NOT_GRANTABLE');
    const { rows } = await h.ctx.sql.query<{ id: string; q: number }>(
      `SELECT id, purchased_quantity AS q FROM subscriptions WHERE id = ANY($1::uuid[]) ORDER BY id`,
      [[running, next]],
    );
    expect(rows.map((row) => row.q)).toEqual([2, 2]);
  });

  it('G9-01 (F-012) a next period still a draft leaves the period that runs grantable and pricing the plan', async () => {
    const running = await h.subscription(2, 'K2');
    const planId = await h.planOf(running);
    await h.seat({ subscriptionId: running }, code());
    await nextPeriod(h, running, 'DRAFT', h.inDays(30));

    const created = await h.grant({ requestId: h.gate.grantable(person(), planId) }).expect(201);

    const assignmentId = h.dataOf<{ task: { assignmentId: string } }>(created).task.assignmentId;
    const { rows } = await h.ctx.sql.query<{ subscription_id: string }>(
      `SELECT subscription_id FROM license_assignments WHERE id = $1`,
      [assignmentId],
    );
    expect(rows[0].subscription_id).toBe(running);
  });

  /** How many rights a subscription holds on a day, as the database counts them for the seats bought (`license_assignments_seat_capacity`). */
  const heldOn = async (subscriptionId: string, day: string): Promise<number> =>
    (
      await h.ctx.sql.query<{ held: number }>(
        `SELECT count(*)::int AS held FROM license_assignments
          WHERE subscription_id = $1 AND failed_at IS NULL AND cancelled_at IS NULL
            AND valid_from <= $2::date AND (valid_until IS NULL OR valid_until > $2::date)`,
        [subscriptionId, day],
      )
    ).rows[0].held;
  const successorsOf = async (assignmentId: string) =>
    (
      await h.ctx.sql.query<{ subscription_id: string; source: string; valid_from: string }>(
        `SELECT subscription_id, source::text AS source, to_char(valid_from, 'YYYY-MM-DD') AS valid_from
           FROM license_assignments WHERE predecessor_id = $1`,
        [assignmentId],
      )
    ).rows;
  const endOf = async (assignmentId: string): Promise<string | null> =>
    (
      await h.ctx.sql.query<{ valid_until: string | null }>(
        `SELECT to_char(valid_until, 'YYYY-MM-DD') AS valid_until FROM license_assignments WHERE id = $1`,
        [assignmentId],
      )
    ).rows[0].valid_until;
  const sizeNext = (next: string, seats: number) =>
    h.ctx.sql.query(`UPDATE subscriptions SET purchased_quantity = $2 WHERE id = $1`, [next, seats]);
  const taskOf = (created: Parameters<typeof h.dataOf>[0]) =>
    h.dataOf<{ task: { id: string; assignmentId: string } }>(created).task;

  it('FX2-R1 a seat granted after the next period was recorded ahead goes on into it: ten seats and four people, five seats next, the fifth person holds the fifth from its first day', async () => {
    const running = await h.subscription(10, 'K2');
    const planId = await h.planOf(running);
    for (let index = 0; index < 4; index += 1) await h.seat({ subscriptionId: running }, code());
    const startsOn = h.inDays(30);
    const next = await nextPeriod(h, running, 'ACTIVE', startsOn);
    await carry(h, running, next, startsOn);
    await sizeNext(next, 5);

    const { assignmentId } = taskOf(await h.grant({ requestId: h.gate.grantable(person(), planId) }).expect(201));

    expect(await successorsOf(assignmentId)).toEqual([
      { subscription_id: next, source: 'RENEWAL_CARRY', valid_from: startsOn },
    ]);
    expect(await endOf(assignmentId)).toBe(startsOn);
    expect(await heldOn(running, h.today())).toBe(5);
    expect(await heldOn(next, startsOn)).toBe(5);
  });

  it('FX2-R1 a grant that buys a seat on the period that runs finds the seat of the next period too: one seat, two seats next, both held from its first day', async () => {
    const running = await h.subscription(1, 'K2');
    const planId = await h.planOf(running);
    await h.seat({ subscriptionId: running }, code());
    const startsOn = h.inDays(30);
    const next = await nextPeriod(h, running, 'ACTIVE', startsOn);
    await carry(h, running, next, startsOn);
    await sizeNext(next, 2);

    const { assignmentId } = taskOf(
      await h.grant({ requestId: h.gate.grantable(person(), planId), purchase: {} }).expect(201),
    );

    expect((await successorsOf(assignmentId)).map((row) => row.subscription_id)).toEqual([next]);
    expect(await heldOn(running, h.today())).toBe(2);
    expect(await heldOn(next, startsOn)).toBe(2);
  });

  it('FX2-R1 a seat that ends before the next period begins is not carried into it', async () => {
    const running = await h.subscription(10, 'K2');
    const planId = await h.planOf(running);
    await h.seat({ subscriptionId: running }, code());
    const startsOn = h.inDays(30);
    const next = await nextPeriod(h, running, 'ACTIVE', startsOn);
    await carry(h, running, next, startsOn);
    await sizeNext(next, 1);
    const employeeId = person();
    const requestId = h.gate.answer({
      status: 'GRANTABLE',
      seat: 'PERSONAL',
      employeeId,
      planId,
      departmentId: h.gate.defaultDepartmentId,
      expectedEndDate: h.inDays(10),
      termMonths: 1,
      termBound: true,
    });

    const { assignmentId } = taskOf(await h.grant({ requestId }).expect(201));

    expect(await successorsOf(assignmentId)).toEqual([]);
    expect(await endOf(assignmentId)).toBeNull();
    expect(await heldOn(next, startsOn)).toBe(1);
  });

  it('FX2-R1 a next period that buys fewer seats than the grant needs refuses the grant, 422 SUBSCRIPTION_NEXT_PERIOD_SEATS, and writes nothing', async () => {
    const running = await h.subscription(10, 'K2');
    const planId = await h.planOf(running);
    for (let index = 0; index < 4; index += 1) await h.seat({ subscriptionId: running }, code());
    const startsOn = h.inDays(30);
    const next = await nextPeriod(h, running, 'ACTIVE', startsOn);
    await carry(h, running, next, startsOn);
    await sizeNext(next, 4);

    const refused = await h.grant({ requestId: h.gate.grantable(person(), planId) }).expect(422);

    expect(h.codeOf(refused)).toBe('PROVISIONING.SUBSCRIPTION_NEXT_PERIOD_SEATS');
    expect(await heldOn(running, h.today())).toBe(4);
    expect(await heldOn(next, startsOn)).toBe(4);
    // A next period a department owns is no pool: no seat is bought on it, the grant is refused as before (S20-T4c).
    expect(await purchasedOf(next)).toBe(4);
  });

  const purchasedOf = async (subscriptionId: string): Promise<number> =>
    (
      await h.ctx.sql.query<{ q: number }>(`SELECT purchased_quantity AS q FROM subscriptions WHERE id = $1`, [
        subscriptionId,
      ])
    ).rows[0].q;
  /** The notices of a rise of the seats bought of a subscription (`QĐ-110v`). */
  const risesOf = async (subscriptionId: string) =>
    (
      await h.ctx.sql.query<{ recipient_employee_id: string; params: Record<string, unknown> }>(
        `SELECT recipient_employee_id, params FROM in_app_notifications
          WHERE code = 'SUBSCRIPTION_SEATS_INCREASED' AND subject_id = $1 ORDER BY created_at, id`,
        [subscriptionId],
      )
    ).rows;

  it('S20-T4c (R2-8) a request granted after the IT Admin recorded the adjustment: the next period of the pool is full, the old one has a free seat, the grant succeeds and buys one more seat for the next period', async () => {
    const running = await h.subscription(10, 'K2');
    await takeOwnerOff(h, running);
    await h.ctx.sql.query(`UPDATE subscriptions SET responsible_it_admin_employee_id = $2 WHERE id = $1`, [
      running,
      answering.employeeId,
    ]);
    const planId = await h.planOf(running);
    for (let index = 0; index < 4; index += 1) await h.seat({ subscriptionId: running }, code());
    const startsOn = h.inDays(30);
    const next = await nextPeriod(h, running, 'ACTIVE', startsOn);
    await carry(h, running, next, startsOn);
    // The adjustment bought exactly the 4 seats needed, so the next period is full while the period that runs has 6 free.
    await sizeNext(next, 4);
    const requestId = h.gate.grantable(person(), planId);

    const created = await h.grant({ requestId }).expect(201);

    const { assignmentId } = taskOf(created);
    expect(await successorsOf(assignmentId)).toEqual([
      { subscription_id: next, source: 'RENEWAL_CARRY', valid_from: startsOn },
    ]);
    expect(await purchasedOf(next)).toBe(5);
    expect(await purchasedOf(running)).toBe(10);
    expect(await heldOn(running, h.today())).toBe(5);
    expect(await heldOn(next, startsOn)).toBe(5);
    // The IT Admin who answers for the pool is told of the seat bought for the next period, with the request it was bought for.
    const notices = await risesOf(next);
    expect(notices).toHaveLength(1);
    expect(notices[0].recipient_employee_id).toBe(answering.employeeId);
    expect(notices[0].params).toMatchObject({ subscriptionId: next, fromQuantity: 4, toQuantity: 5, requestId });
    expect(await risesOf(running)).toEqual([]);
  });

  it('S20-T4c a next period of the pool with room buys nothing: the seat carried takes the free one', async () => {
    const running = await h.subscription(10, 'K2');
    await takeOwnerOff(h, running);
    const planId = await h.planOf(running);
    for (let index = 0; index < 4; index += 1) await h.seat({ subscriptionId: running }, code());
    const startsOn = h.inDays(30);
    const next = await nextPeriod(h, running, 'ACTIVE', startsOn);
    await carry(h, running, next, startsOn);
    await sizeNext(next, 6);

    await h.grant({ requestId: h.gate.grantable(person(), planId) }).expect(201);

    expect(await purchasedOf(next)).toBe(6);
    expect(await heldOn(next, startsOn)).toBe(5);
    expect(await risesOf(next)).toEqual([]);
  });

  it('FX2-R1 a grant closed as failed gives back the seat of both periods: the right on the next period goes with it', async () => {
    const running = await h.subscription(10, 'K2');
    const planId = await h.planOf(running);
    for (let index = 0; index < 4; index += 1) await h.seat({ subscriptionId: running }, code());
    const startsOn = h.inDays(30);
    const next = await nextPeriod(h, running, 'ACTIVE', startsOn);
    await carry(h, running, next, startsOn);
    await sizeNext(next, 5);
    const { id, assignmentId } = taskOf(await h.grant({ requestId: h.gate.grantable(person(), planId) }).expect(201));
    expect(await heldOn(next, startsOn)).toBe(5);

    await h.fail(id, { reason: 'The portal refused the account' }).expect(200);
    await h.closeFailed(id, { reason: 'The portal cannot hold the account' }).expect(200);

    expect(await heldOn(running, h.today())).toBe(4);
    expect(await heldOn(next, startsOn)).toBe(4);
    const { rows } = await h.ctx.sql.query<{ voided: boolean }>(
      `SELECT (failed_at IS NOT NULL OR cancelled_at IS NOT NULL) AS voided FROM license_assignments WHERE predecessor_id = $1`,
      [assignmentId],
    );
    expect(rows).toEqual([{ voided: true }]);
  });
});
