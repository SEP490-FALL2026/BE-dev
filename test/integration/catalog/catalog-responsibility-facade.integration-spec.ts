import { TransactionRunner } from '../../../src/infrastructure/database/transaction-runner';
import { CatalogResponsibilityApi } from '../../../src/modules/catalog/public/catalog-responsibility.api';
import { ResponsibilityHandoverRefusedError } from '../../../src/modules/catalog/public/catalog-responsibility.errors';
import type { ApiAccount } from '../../support/api-accounts';
import { buildActivatedAccount, principalOf } from '../../support/builders/account.builder';
import { SeatHarness } from '../../support/seat-baseline-harness';

const h = new SeatHarness();

/**
 * X-IT.2 (`QĐ-111g`, R-8, R-26): the facade the hand-over of an IT Admin who leaves moves their subscriptions and applications through.
 * Everything one IT Admin answers for goes to another in the caller's transaction, with one audit event for each thing that changed hands,
 * or nothing moves. Real PostgreSQL, through the facade the personnel module calls.
 */
describe('the catalog facade that counts and hands over what an IT Admin answers for (X-IT.2)', () => {
  let it2: ApiAccount;
  let it3: ApiAccount;
  let api: CatalogResponsibilityApi;
  let runner: TransactionRunner;

  const principal = (account: ApiAccount) => principalOf(h.ctx, account.accessToken);

  const holders = async (table: 'subscriptions' | 'applications', ids: string[]): Promise<(string | null)[]> =>
    (
      await h.ctx.sql.query<{ responsible: string | null }>(
        `SELECT responsible_it_admin_employee_id AS responsible FROM ${table} WHERE id = ANY($1::uuid[]) ORDER BY id`,
        [ids],
      )
    ).rows.map((row) => row.responsible);

  const applicationOf = async (subscriptionId: string): Promise<string> =>
    (
      await h.ctx.sql.query<{ id: string }>(
        `SELECT p.application_id AS id FROM subscriptions s JOIN plans p ON p.id = s.plan_id WHERE s.id = $1`,
        [subscriptionId],
      )
    ).rows[0].id;

  const audits = async (action: string, id: string) =>
    (
      await h.ctx.sql.query<{ before: unknown; after: unknown; actor_kind: string }>(
        'SELECT before, after, actor_kind FROM audit_events WHERE action = $1 AND resource_id = $2',
        [action, id],
      )
    ).rows;

  /** A subscription (and the application of its plan) that `holder` answers for: made by IT 1, then handed to the holder by SQL. */
  const thingsOf = async (holder: ApiAccount, count = 1) => {
    const subscriptionIds: string[] = [];
    const applicationIds: string[] = [];
    for (let index = 0; index < count; index += 1) {
      const subscriptionId = await h.subscription(10, 'K2');
      const applicationId = await applicationOf(subscriptionId);
      await h.ctx.sql.query(`UPDATE subscriptions SET responsible_it_admin_employee_id = $2 WHERE id = $1`, [
        subscriptionId,
        holder.employeeId,
      ]);
      await h.ctx.sql.query(`UPDATE applications SET responsible_it_admin_employee_id = $2 WHERE id = $1`, [
        applicationId,
        holder.employeeId,
      ]);
      subscriptionIds.push(subscriptionId);
      applicationIds.push(applicationId);
    }

    return { subscriptionIds: subscriptionIds.sort(), applicationIds: applicationIds.sort() };
  };

  beforeAll(async () => {
    await h.start();
    it2 = await buildActivatedAccount(h.ctx, h.seed, { code: 'E-IT2', email: 'it2@acme.vn', role: 'IT_ADMIN' });
    it3 = await buildActivatedAccount(h.ctx, h.seed, { code: 'E-IT3', email: 'it3@acme.vn', role: 'IT_ADMIN' });
    api = h.ctx.app.get(CatalogResponsibilityApi);
    runner = h.ctx.app.get(TransactionRunner);
  }, 240000);

  afterAll(async () => {
    await h.stop();
  });

  it('counts the subscriptions and the applications of each IT Admin in one read, zero for a person who answers for none', async () => {
    await thingsOf(it3, 3);
    await thingsOf(it2, 1);

    const counts = await api.countResponsibilitiesOf([it3.employeeId, it2.employeeId, h.finance.employeeId]);

    expect(counts.get(it3.employeeId)).toEqual({ subscriptions: 3, applications: 3 });
    expect(counts.get(it2.employeeId)).toEqual({ subscriptions: 1, applications: 1 });
    expect(counts.get(h.finance.employeeId)).toEqual({ subscriptions: 0, applications: 0 });
    expect([...(await api.countResponsibilitiesOf([]))]).toEqual([]);
  });

  it('hands every subscription and application of the IT Admin to another and leaves everyone else’s alone', async () => {
    const leaving = await buildActivatedAccount(h.ctx, h.seed, {
      code: 'E-IT4',
      email: 'it4@acme.vn',
      role: 'IT_ADMIN',
    });
    const mine = await thingsOf(leaving, 2);
    const others = await thingsOf(it2, 1);
    const actor = await principal(h.it1);

    const moved = await runner.run((tx) => api.transferResponsibilities(tx, actor, leaving.employeeId, it3.employeeId));

    expect(moved).toEqual(mine);
    expect(await holders('subscriptions', mine.subscriptionIds)).toEqual([it3.employeeId, it3.employeeId]);
    expect(await holders('applications', mine.applicationIds)).toEqual([it3.employeeId, it3.employeeId]);
    expect(await holders('subscriptions', others.subscriptionIds)).toEqual([it2.employeeId]);
    expect(await holders('applications', others.applicationIds)).toEqual([it2.employeeId]);
    expect((await api.countResponsibilitiesOf([leaving.employeeId])).get(leaving.employeeId)).toEqual({
      subscriptions: 0,
      applications: 0,
    });
    for (const id of mine.subscriptionIds) {
      expect(await audits('SUBSCRIPTION.RESPONSIBILITY_TRANSFERRED', id)).toEqual([
        {
          before: { responsibleItAdminEmployeeId: leaving.employeeId },
          after: { responsibleItAdminEmployeeId: it3.employeeId },
          actor_kind: 'USER',
        },
      ]);
    }
    for (const id of mine.applicationIds) {
      expect(await audits('APPLICATION.RESPONSIBILITY_TRANSFERRED', id)).toHaveLength(1);
    }
  });

  it('moves nothing and writes nothing when the IT Admin answers for nothing', async () => {
    const idle = await buildActivatedAccount(h.ctx, h.seed, { code: 'E-IT5', email: 'it5@acme.vn', role: 'IT_ADMIN' });
    const before = await h.count('audit_events');

    const moved = await runner.run(async (tx) =>
      api.transferResponsibilities(tx, await principal(h.it1), idle.employeeId, it3.employeeId),
    );

    expect(moved).toEqual({ subscriptionIds: [], applicationIds: [] });
    expect(await h.count('audit_events')).toBe(before);
  });

  it('refuses the same person, an employee who is not an IT Admin, and an IT Admin who has left, with nothing written', async () => {
    const leaving = await buildActivatedAccount(h.ctx, h.seed, {
      code: 'E-IT6',
      email: 'it6@acme.vn',
      role: 'IT_ADMIN',
    });
    const gone = await buildActivatedAccount(h.ctx, h.seed, { code: 'E-IT7', email: 'it7@acme.vn', role: 'IT_ADMIN' });
    await h.ctx.sql.query(`UPDATE employees SET status = 'TERMINATED' WHERE id = $1`, [gone.employeeId]);
    const mine = await thingsOf(leaving, 1);
    const actor = await principal(h.it1);
    const before = await h.count('audit_events');

    const attempts: Array<[string, string, string]> = [
      ['SAME_EMPLOYEE', leaving.employeeId, leaving.employeeId],
      ['TARGET_NOT_IT_ADMIN', leaving.employeeId, h.finance.employeeId],
      ['TARGET_NOT_IT_ADMIN', leaving.employeeId, gone.employeeId],
    ];
    for (const [problem, from, to] of attempts) {
      const refused = await runner
        .run((tx) => api.transferResponsibilities(tx, actor, from, to))
        .then(
          () => null,
          (error: unknown) => error,
        );

      expect(refused).toBeInstanceOf(ResponsibilityHandoverRefusedError);
      expect((refused as ResponsibilityHandoverRefusedError).problem).toBe(problem);
    }

    expect(await holders('subscriptions', mine.subscriptionIds)).toEqual([leaving.employeeId]);
    expect(await h.count('audit_events')).toBe(before);
  });

  /** A block on the access of the person from `day` (a departure the file has recorded): written through `sql` or in the caller's own transaction. */
  const blockFrom = (employeeId: string, day: string) =>
    h.ctx.sql.query(
      `INSERT INTO employee_access_blocks (employee_id, organization_id, blocked_from, cause)
       VALUES ($1, $2, $3::date, 'DEPARTURE_BLOCK_NOW')`,
      [employeeId, h.seed.organizationId, day],
    );

  it('X-IT-R3: refuses an IT Admin whose access a departure already blocks, sees a block written in the caller’s own transaction, and accepts one whose block begins later', async () => {
    const leaving = await buildActivatedAccount(h.ctx, h.seed, {
      code: 'E-IT9',
      email: 'it9@acme.vn',
      role: 'IT_ADMIN',
    });
    const blocked = await buildActivatedAccount(h.ctx, h.seed, {
      code: 'E-IT10',
      email: 'it10@acme.vn',
      role: 'IT_ADMIN',
    });
    const inFlight = await buildActivatedAccount(h.ctx, h.seed, {
      code: 'E-IT11',
      email: 'it11@acme.vn',
      role: 'IT_ADMIN',
    });
    const later = await buildActivatedAccount(h.ctx, h.seed, {
      code: 'E-IT12',
      email: 'it12@acme.vn',
      role: 'IT_ADMIN',
    });
    const mine = await thingsOf(leaving, 1);
    const actor = await principal(h.it1);
    await blockFrom(blocked.employeeId, '2000-01-01');
    await blockFrom(later.employeeId, '2999-12-31');
    const refusal = (to: string, before?: (tx: Parameters<Parameters<typeof runner.run>[0]>[0]) => Promise<unknown>) =>
      runner
        .run(async (tx) => {
          await before?.(tx);

          return api.transferResponsibilities(tx, actor, leaving.employeeId, to);
        })
        .then(
          () => null,
          (error: unknown) => (error as ResponsibilityHandoverRefusedError).problem,
        );

    expect(await refusal(blocked.employeeId)).toBe('TARGET_NOT_IT_ADMIN');
    expect(
      await refusal(
        inFlight.employeeId,
        (tx) =>
          tx.$executeRaw`INSERT INTO employee_access_blocks (employee_id, organization_id, blocked_from, cause)
           VALUES (${inFlight.employeeId}::uuid, ${h.seed.organizationId}::uuid, '2000-01-01'::date, 'DEPARTURE_BLOCK_NOW')`,
      ),
    ).toBe('TARGET_NOT_IT_ADMIN');
    expect(await holders('subscriptions', mine.subscriptionIds)).toEqual([leaving.employeeId]);

    expect(await refusal(later.employeeId)).toBeNull();
    expect(await holders('subscriptions', mine.subscriptionIds)).toEqual([later.employeeId]);
  });

  it('is part of the caller’s transaction: when the caller rolls back, subscriptions, applications and audit events come back', async () => {
    const leaving = await buildActivatedAccount(h.ctx, h.seed, {
      code: 'E-IT8',
      email: 'it8@acme.vn',
      role: 'IT_ADMIN',
    });
    const mine = await thingsOf(leaving, 2);
    const actor = await principal(h.it1);
    const before = await h.count('audit_events');

    await expect(
      runner.run(async (tx) => {
        await api.transferResponsibilities(tx, actor, leaving.employeeId, it3.employeeId);
        throw new Error('the caller failed after the hand-over');
      }),
    ).rejects.toThrow('the caller failed');

    expect(await holders('subscriptions', mine.subscriptionIds)).toEqual([leaving.employeeId, leaving.employeeId]);
    expect(await holders('applications', mine.applicationIds)).toEqual([leaving.employeeId, leaving.employeeId]);
    expect(await h.count('audit_events')).toBe(before);
  });
});
