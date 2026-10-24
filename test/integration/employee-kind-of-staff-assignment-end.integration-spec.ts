import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import request from 'supertest';
import { HR_BASIS } from '../support/hr-basis';
import { waitForLockWaiters } from '../support/lock-wait';
import { SeatHarness } from '../support/seat-baseline-harness';

const h = new SeatHarness();

/**
 * P28-04 (`INV-07`, `US-02-02` AC-19): a contractor, freelancer or intern holds every open seat with an expected end
 * date. Correcting a person's kind of staff to one of those is refused while they hold an open seat without one — over
 * HTTP with the 422 of the other refused values and no audit, and in PostgreSQL for any writer, in both orders of a race
 * with a new seat.
 */
describe('kind of staff and the expected end of open seats (integration, P28-04, INV-07)', () => {
  let subscriptionId: string;

  beforeAll(async () => {
    await h.start();
    subscriptionId = await h.subscription(100);
  }, 180000);

  afterAll(async () => {
    await h.stop();
  });

  const patch = (id: string, employmentType: string) =>
    request(h.server()).patch(`/api/v1/employees/${id}`).set(h.as(h.it1)).send({ employmentType, hrBasis: HR_BASIS });
  const reasonsOf = (response: request.Response) =>
    (response.body as { error: { details: { reasons: { field: string; code: string }[] } } }).error.details.reasons;
  const kindOf = async (id: string) =>
    (await h.ctx.sql.query<{ employment_type: string }>(`SELECT employment_type FROM employees WHERE id = $1`, [id]))
      .rows[0].employment_type;
  const auditCount = async (id: string) =>
    (
      await h.ctx.sql.query(
        `SELECT 1 FROM audit_events WHERE action = 'EMPLOYEE.OFFICIAL_FIELDS_CHANGED' AND resource_id = $1`,
        [id],
      )
    ).rowCount;
  /** A seat held through the seat baseline, as the application writes one. */
  const seatOf = async (code: string, row: Record<string, string> = {}) => {
    const employeeId = await h.person(code);
    await h.written({ subscriptionId }, [
      { employee_code: code, account_identifier: `${code.toLowerCase()}@acme.vn`, ...row },
    ]);

    return employeeId;
  };
  const sqlStateOf = (failure: unknown): string | undefined => (failure as { code?: string } | null)?.code;

  it('refuses CONTRACTOR, FREELANCER and INTERN while an open seat has no expected end, and changes and audits nothing', async () => {
    const id = await seatOf('KS1');

    for (const kind of ['CONTRACTOR', 'FREELANCER', 'INTERN']) {
      const response = await patch(id, kind).expect(422);

      expect((response.body as { error: { code: string } }).error.code).toBe('EMPLOYEE.ROW_INVALID');
      expect(reasonsOf(response)).toEqual([{ field: 'employmentType', code: 'OPEN_ASSIGNMENT_NEEDS_EXPECTED_END' }]);
    }
    expect(await kindOf(id)).toBe('STAFF');
    expect(await auditCount(id)).toBe(0);
  });

  it('allows the change when every open seat has an expected end, or the seat without one has ended or failed', async () => {
    const withEnd = await seatOf('KS2', { expected_end_date: '2030-12-31' });
    const ended = await seatOf('KS3');
    await h.ctx.sql.query(`UPDATE license_assignments SET valid_until = valid_from + 1 WHERE employee_id = $1`, [
      ended,
    ]);

    await patch(withEnd, 'CONTRACTOR').expect(200);
    await patch(ended, 'INTERN').expect(200);

    expect([await kindOf(withEnd), await kindOf(ended)]).toEqual(['CONTRACTOR', 'INTERN']);
  });

  it('is refused by PostgreSQL for a writer that goes around the application', async () => {
    const id = await seatOf('KS4');

    const failure = await h.ctx.sql
      .query(`UPDATE employees SET employment_type = 'FREELANCER' WHERE id = $1`, [id])
      .then(
        () => null,
        (error: unknown) => error,
      );

    expect(sqlStateOf(failure)).toBe('23514');
    expect(await kindOf(id)).toBe('STAFF');
  });

  describe('a new seat and the change of kind, racing', () => {
    let first: Client;
    let second: Client;

    beforeEach(async () => {
      first = new Client({ connectionString: h.ctx.database.url });
      second = new Client({ connectionString: h.ctx.database.url });
      await Promise.all([first.connect(), second.connect()]);
    });

    afterEach(async () => {
      await Promise.all([first.end(), second.end()]);
    });

    const openSeat = (client: Client, employeeId: string) =>
      client.query(
        `INSERT INTO license_assignments (id, organization_id, kind, source, plan_id, subscription_id, employee_id,
           account_identifier, normalized_account_identifier, valid_from, valid_from_basis, created_by_app_user_id)
         SELECT $1, s.organization_id, 'PERSONAL', 'REQUEST', s.plan_id, s.id, $2, $3, $3, CURRENT_DATE, 'RECORDED', $4
           FROM subscriptions s WHERE s.id = $5`,
        [randomUUID(), employeeId, `race-${randomUUID()}@acme.vn`, h.it1.appUserId, subscriptionId],
      );

    it('seat first: the change of kind waits for it, then is refused', async () => {
      const id = await h.person('KS5');
      await first.query('BEGIN');
      await openSeat(first, id);

      const change = second.query(`UPDATE employees SET employment_type = 'CONTRACTOR' WHERE id = $1`, [id]).then(
        () => null,
        (error: unknown) => error,
      );
      await waitForLockWaiters(h.ctx.sql, 1);
      await first.query('COMMIT');

      expect(sqlStateOf(await change)).toBe('23514');
      expect(await kindOf(id)).toBe('STAFF');
    });

    it('change first: the seat without an expected end waits for it, then is refused', async () => {
      const id = await h.person('KS6');
      await first.query('BEGIN');
      await first.query(`UPDATE employees SET employment_type = 'CONTRACTOR' WHERE id = $1`, [id]);

      const seat = openSeat(second, id).then(
        () => null,
        (error: unknown) => error,
      );
      await waitForLockWaiters(h.ctx.sql, 1);
      await first.query('COMMIT');

      expect(sqlStateOf(await seat)).toBe('23514');
      expect((await h.ctx.sql.query(`SELECT 1 FROM license_assignments WHERE employee_id = $1`, [id])).rowCount).toBe(
        0,
      );
    });
  });
});
