import type { ApiAccount } from '../../support/api-accounts';
import { buildActivatedAccount } from '../../support/builders/account.builder';
import { declareSubscription } from '../../support/builders/catalog.builder';
import { RevocationHarness } from '../../support/revocation-harness';

const h = new RevocationHarness();

/**
 * `BR-MF1-09a`, `BR-MF1-09b`, `QĐ-103d`, `FR-3.23` (spec `qd103-grant-from-shared-pool` §5, `US-07-13` AC-2, AC-3, AC-4, AC-8), real PostgreSQL:
 * an IT Admin grants a K2 seat from the pool of the plan to a person of any department; a purchase is recorded with the grant only when the
 * plan has no free seat (a draft subscription does not count), and then adds one seat, because a grant is for one person.
 */
describe('the purchase recorded with a grant from the shared pool (integration, real PostgreSQL)', () => {
  let counter = 0;
  const code = () => `E-PP-${(counter += 1)}`;
  let people: string[] = [];
  let answering: ApiAccount;

  /** An active K2 subscription of a new plan with `quantity` seats bought. */
  const k2 = async (quantity: number) => {
    const subscriptionId = await h.subscription(quantity, 'K2');

    return { subscriptionId, planId: await h.planOf(subscriptionId) };
  };
  /** A second subscription of the same plan: allowed while the seat baseline is open (it is only warned about). */
  const another = (planId: string, body: Record<string, unknown>) =>
    declareSubscription(h.ctx, h.it1.accessToken, {
      ownerDepartmentId: h.seed.departmentId,
      planId,
      kind: 'TERM',
      ...body,
    });
  const priced = {
    unitPrice: { amount: '1000000', currency: 'VND' },
    billingCycle: 'MONTHLY',
    startDate: '2026-01-05',
  };
  const quantityOf = async (subscriptionId: string): Promise<number> =>
    (
      await h.ctx.sql.query<{ q: number }>(`SELECT purchased_quantity AS q FROM subscriptions WHERE id = $1`, [
        subscriptionId,
      ])
    ).rows[0].q;
  const rows = async () => ({
    assignments: await h.count('license_assignments'),
    tasks: await h.count('provisioning_tasks'),
  });
  const purchaseOf = async (taskId: string) =>
    (
      await h.ctx.sql.query<{
        purchase_kind: string | null;
        purchase_reason: string | null;
        purchased_at: Date | null;
      }>(`SELECT purchase_kind, purchase_reason, purchased_at FROM provisioning_tasks WHERE id = $1`, [taskId])
    ).rows[0];
  /** The next person who has no seat yet. */
  const person = (): string => people.shift() as string;

  beforeAll(async () => {
    await h.start();
    people = [];
    for (let i = 0; i < 30; i += 1) people.push(await h.person(`E-PPX-${i}`));
    answering = await buildActivatedAccount(h.ctx, h.seed, { code: 'E-IT9', email: 'it9@acme.vn', role: 'IT_ADMIN' });
  }, 300000);

  afterAll(async () => {
    await h.stop();
  });

  it('BR-MF1-09a (AC-2): refuses a purchase while the pool has free seats of the plan, even in another subscription of it, and keeps the refusal', async () => {
    const full = await k2(1);
    await h.seat({ subscriptionId: full.subscriptionId }, code());
    const spare = await another(full.planId, { ...priced, purchasedQuantity: 2 });
    const before = await rows();
    const requestId = h.gate.grantable(person(), full.planId);

    const refused = await h
      .grant({ requestId, subscriptionId: full.subscriptionId, purchase: { reason: 'more' } })
      .expect(409);

    expect(h.codeOf(refused)).toBe('PROVISIONING.PURCHASE_NOT_ALLOWED');
    expect(h.detailsOf(refused)).toMatchObject({ freeSeats: 2, subscriptionIds: [spare] });
    expect(await rows()).toEqual(before);
    expect(await quantityOf(full.subscriptionId)).toBe(1);
    // The grant rolled back, the refusal did not: it is kept with the seats that were free (AC-2).
    expect(await h.auditEvents('AccessRequest', requestId)).toMatchObject([
      {
        action: 'PROVISIONING_TASK.PURCHASE_REFUSED',
        actor_app_user_id: h.it1.appUserId,
        after: { requestId, planId: full.planId, freeSeats: 2, subscriptionIds: [spare] },
      },
    ]);
  });

  it('BR-MF1-09a (AC-2): refuses a purchase while the subscription named itself has free seats', async () => {
    const own = await k2(3);
    await h.seat({ subscriptionId: own.subscriptionId }, code());

    const refused = await h
      .grant({ requestId: h.gate.grantable(person(), own.planId), subscriptionId: own.subscriptionId, purchase: {} })
      .expect(409);

    expect(h.detailsOf(refused)).toMatchObject({ freeSeats: 2, subscriptionIds: [own.subscriptionId] });
    expect(await quantityOf(own.subscriptionId)).toBe(3);
  });

  it('BR-MF1-09a (DA4-20): the seats of a draft subscription of the plan are not free: a purchase is recorded', async () => {
    const full = await k2(1);
    await h.seat({ subscriptionId: full.subscriptionId }, code());
    // A draft with no price: its three seats cannot be granted.
    await another(full.planId, { purchasedQuantity: 3 });

    const created = await h
      .grant({ requestId: h.gate.grantable(person(), full.planId), subscriptionId: full.subscriptionId, purchase: {} })
      .expect(201);

    const task = h.dataOf<{ task: { id: string; purchase: { kind: string } } }>(created).task;
    expect(task.purchase).toMatchObject({ kind: 'POOL_TOP_UP' });
    expect(await quantityOf(full.subscriptionId)).toBe(2);
  });

  it('BR-MF1-09a (AC-3, Q-36): with no seat free and one only being taken back, a purchase needs a reason; with one it adds a seat', async () => {
    const pool = await k2(1);
    const held = await h.seat({ subscriptionId: pool.subscriptionId }, code());
    await h.open(held, 'DEPARTURE');
    const body = { requestId: h.gate.grantable(person(), pool.planId), subscriptionId: pool.subscriptionId };

    const missing = await h.grant({ ...body, purchase: {} }).expect(422);
    expect(h.codeOf(missing)).toBe('PROVISIONING.PURCHASE_REASON_REQUIRED');
    expect(await quantityOf(pool.subscriptionId)).toBe(1);

    const created = await h
      .grant({ ...body, purchase: { reason: 'the leaver keeps the seat for two weeks' } })
      .expect(201);

    const { task } = h.dataOf<{ task: { id: string; purchase: { kind: string; reason: string } } }>(created);
    expect(task.purchase).toMatchObject({ kind: 'POOL_TOP_UP', reason: 'the leaver keeps the seat for two weeks' });
    expect(await quantityOf(pool.subscriptionId)).toBe(2);
  });

  it('BR-MF1-09a (AC-4): free seats of another plan do not stop a purchase on a plan that is full', async () => {
    const professional = await k2(5);
    await h.seat({ subscriptionId: professional.subscriptionId }, code());
    const organization = await k2(1);
    await h.seat({ subscriptionId: organization.subscriptionId }, code());

    await h
      .grant({
        requestId: h.gate.grantable(person(), organization.planId),
        subscriptionId: organization.subscriptionId,
        purchase: {},
      })
      .expect(201);

    expect(await quantityOf(organization.subscriptionId)).toBe(2);
    expect(await quantityOf(professional.subscriptionId)).toBe(5);
  });

  it('BR-MF1-09b (AC-8): with the pool empty and nothing being taken back, a purchase needs no reason and buys one seat for one person', async () => {
    const pool = await k2(1);
    await h.seat({ subscriptionId: pool.subscriptionId }, code());

    const created = await h
      .grant({ requestId: h.gate.grantable(person(), pool.planId), subscriptionId: pool.subscriptionId, purchase: {} })
      .expect(201);

    const task = h.dataOf<{ task: { id: string } }>(created).task;
    expect(await purchaseOf(task.id)).toMatchObject({ purchase_kind: 'POOL_TOP_UP', purchase_reason: null });
    expect((await purchaseOf(task.id)).purchased_at).not.toBeNull();
    // One seat bought for the one person of the grant: the pool is full again.
    expect(await h.freeSeats(pool.subscriptionId)).toBe(0);
    expect(await quantityOf(pool.subscriptionId)).toBe(2);
  });

  it('BR-MF1-09b (R-E05): a purchase on a plan that is not K2 or K4 is 422, and a grant with no purchase on a full pool is 409 with the free seats of the plan', async () => {
    const k1 = await h.subscription(5, 'K1');
    const notApplicable = await h
      .grant({
        requestId: h.gate.grantable(person(), await h.planOf(k1)),
        subscriptionId: k1,
        purchase: {},
      })
      .expect(422);
    expect(h.codeOf(notApplicable)).toBe('PROVISIONING.PURCHASE_NOT_APPLICABLE');

    const full = await k2(1);
    await h.seat({ subscriptionId: full.subscriptionId }, code());
    await another(full.planId, { ...priced, purchasedQuantity: 4 });
    const before = await rows();
    const capacity = await h
      .grant({ requestId: h.gate.grantable(person(), full.planId), subscriptionId: full.subscriptionId })
      .expect(409);
    expect(h.codeOf(capacity)).toBe('LICENSE_ASSIGNMENT.SEAT_CAPACITY');
    expect(h.detailsOf(capacity)).toEqual({ freeSeatsInPool: 4 });
    expect(await rows()).toEqual(before);
  });

  it('G9-04 (BR-MF1-09b, BR-MF1-09d): every K1 grant buys the seat of its holder and records it as K1_SUBSCRIPTION', async () => {
    const k1 = await h.subscription(5, 'K1');

    const created = await h
      .grant({ requestId: h.gate.grantable(person(), await h.planOf(k1)), subscriptionId: k1 })
      .expect(201);

    const task = h.dataOf<{ task: { id: string; purchase: { kind: string; reason: string | null } | null } }>(
      created,
    ).task;
    expect(task.purchase).toMatchObject({ kind: 'K1_SUBSCRIPTION', reason: null });
    expect(await purchaseOf(task.id)).toMatchObject({ purchase_kind: 'K1_SUBSCRIPTION', purchase_reason: null });
    expect(await quantityOf(k1)).toBe(6);
  });

  it('the grant takes the seat of the pool for a person of another department than the department that owns the subscription (QĐ-103d)', async () => {
    const other = await h.department(`P-PP-${(counter += 1)}`);
    const pool = await k2(2);
    const outsider = await h.member(other.code, code(), 'Staff');

    const created = await h
      .grant({ requestId: h.gate.grantable(outsider, pool.planId, other.id), subscriptionId: pool.subscriptionId })
      .expect(201);

    const assignmentId = h.dataOf<{ task: { assignmentId: string } }>(created).task.assignmentId;
    const seat = (
      await h.ctx.sql.query<{ owning_department_id: string }>(
        `SELECT owning_department_id FROM license_assignments WHERE id = $1`,
        [assignmentId],
      )
    ).rows[0];
    expect(seat.owning_department_id).toBe(other.id);
  });

  /** The notices of a rise of the seats bought of a subscription: the inbox only grows, so each case reads those of its own subscription. */
  const risesOf = async (subscriptionId: string) =>
    (
      await h.ctx.sql.query<{ recipient_employee_id: string; params: Record<string, unknown> }>(
        `SELECT recipient_employee_id, params FROM in_app_notifications
          WHERE code = 'SUBSCRIPTION_SEATS_INCREASED' AND subject_id = $1 ORDER BY created_at, id`,
        [subscriptionId],
      )
    ).rows;

  it('X-IT.7 (QĐ-110v): the seat a grant buys on a K2 pool is told once to the IT Admin who answers for it, with the request it was bought for', async () => {
    const pool = await k2(1);
    await h.seat({ subscriptionId: pool.subscriptionId }, code());
    await h.ctx.sql.query(`UPDATE subscriptions SET responsible_it_admin_employee_id = $2 WHERE id = $1`, [
      pool.subscriptionId,
      answering.employeeId,
    ]);
    const requestId = h.gate.grantable(person(), pool.planId);

    await h.grant({ requestId, subscriptionId: pool.subscriptionId, purchase: {} }).expect(201);

    const notices = await risesOf(pool.subscriptionId);
    expect(notices).toHaveLength(1);
    expect(notices[0].recipient_employee_id).toBe(answering.employeeId);
    expect(notices[0].params).toMatchObject({
      subscriptionId: pool.subscriptionId,
      fromQuantity: 1,
      toQuantity: 2,
      requestId,
      changedByEmployeeId: h.it1.employeeId,
    });
  });

  it('X-IT.7 (QĐ-110v): a grant that buys no seat, a refused purchase and a purchase made by the IT Admin who answers tell nobody', async () => {
    const roomy = await k2(3);
    await h.ctx.sql.query(`UPDATE subscriptions SET responsible_it_admin_employee_id = $2 WHERE id = $1`, [
      roomy.subscriptionId,
      answering.employeeId,
    ]);
    await h
      .grant({ requestId: h.gate.grantable(person(), roomy.planId), subscriptionId: roomy.subscriptionId })
      .expect(201);
    await h
      .grant({
        requestId: h.gate.grantable(person(), roomy.planId),
        subscriptionId: roomy.subscriptionId,
        purchase: { reason: 'free seats left' },
      })
      .expect(409);
    const own = await k2(1);
    await h.seat({ subscriptionId: own.subscriptionId }, code());

    await h
      .grant({ requestId: h.gate.grantable(person(), own.planId), subscriptionId: own.subscriptionId, purchase: {} })
      .expect(201);

    expect(await risesOf(roomy.subscriptionId)).toEqual([]);
    // IT 1 declared `own` and answers for it: the one who bought is not told of their own purchase.
    expect(await risesOf(own.subscriptionId)).toEqual([]);
  });

  it('X-IT.7 (S-4): the seat bought by every K1 grant tells nobody', async () => {
    const k1 = await h.subscription(5, 'K1');
    await h.ctx.sql.query(`UPDATE subscriptions SET responsible_it_admin_employee_id = $2 WHERE id = $1`, [
      k1,
      answering.employeeId,
    ]);

    await h.grant({ requestId: h.gate.grantable(person(), await h.planOf(k1)), subscriptionId: k1 }).expect(201);

    expect(await quantityOf(k1)).toBe(6);
    expect(await risesOf(k1)).toEqual([]);
  });

  it('the race of two grants for the last seat: one is 201, the other 409 SEAT_CAPACITY (US-07-01 AC-2)', async () => {
    const pool = await k2(1);
    const first = h.gate.grantable(person(), pool.planId);
    const second = h.gate.grantable(person(), pool.planId);

    const answers = await Promise.all([
      h.grant({ requestId: first, subscriptionId: pool.subscriptionId }),
      h.grant({ requestId: second, subscriptionId: pool.subscriptionId }),
    ]);

    expect(answers.map((answer) => answer.status).sort()).toEqual([201, 409]);
    expect(h.codeOf(answers.find((answer) => answer.status === 409) as (typeof answers)[number])).toBe(
      'LICENSE_ASSIGNMENT.SEAT_CAPACITY',
    );
    expect(await h.freeSeats(pool.subscriptionId)).toBe(0);
  });

  it('two grants with a purchase for an empty pool each buy their own seat: no seat is shared and none is lost', async () => {
    const pool = await k2(1);
    await h.seat({ subscriptionId: pool.subscriptionId }, code());
    const body = (employee: string) => ({
      requestId: h.gate.grantable(employee, pool.planId),
      subscriptionId: pool.subscriptionId,
      purchase: {},
    });

    const answers = await Promise.all([h.grant(body(person())), h.grant(body(person()))]);

    // The first to take the lock buys; the second then finds the seat the first bought used, and buys another: two grants, two seats.
    expect(answers.map((answer) => answer.status)).toEqual([201, 201]);
    expect(await quantityOf(pool.subscriptionId)).toBe(3);
    expect(await h.freeSeats(pool.subscriptionId)).toBe(0);
  });
});
