import { Client } from 'pg';
import request from 'supertest';
import { waitForLockWaiters } from '../../support/lock-wait';
import { RequestHarness, type Person } from '../../support/request-harness';

const h = new RequestHarness();

/**
 * The grant of SPENDING_APPROVER meets the sending of a Request by the same person (`D-S21`, `QĐ-93d`(3)). Both take the account of the
 * person: the Request `FOR SHARE` (to judge who holds the role), the grant `FOR UPDATE`. The order of the two is not left to chance: a
 * holder connection takes the account first, each writer is sent and seen waiting (`pg_locks`), and only then is the holder released, so
 * the first of the pair to be served is the one sent first. Either way no open Request has the person who holds the role as a party.
 */
describe('the grant of the spending approver and a Request of the same person (integration, real PostgreSQL)', () => {
  let holder: Client;
  let design: Awaited<ReturnType<RequestHarness['departmentWithUnit']>>;
  let internalPlan: string;
  let counter = 0;

  beforeAll(async () => {
    await h.start();
    design = await h.departmentWithUnit('P-DES');
    internalPlan = await h.plan('K5');
    holder = new Client({ connectionString: h.ctx.database.url });
    await holder.connect();
  }, 240000);

  afterEach(async () => {
    await holder.query('ROLLBACK').catch(() => undefined);
  });

  afterAll(async () => {
    await holder.end();
    await h.stop();
  });

  const person = async (): Promise<Person> => {
    counter += 1;

    return h.staff(design, `DES-C${counter}`);
  };
  const holdAccount = async (appUserId: string) => {
    await holder.query('BEGIN');
    await holder.query('SELECT id FROM app_users WHERE id = $1 FOR UPDATE', [appUserId]);
  };
  const grant = (target: Person) =>
    request(h.server())
      .post(`/api/v1/app-users/${target.account.appUserId}/role-grants`)
      .set({ Authorization: `Bearer ${h.admin}` })
      .send({ role: 'SPENDING_APPROVER' })
      .then((response) => response);
  // A request of supertest is sent when it is awaited: `then` sends it now, so the writer is queued before the next is sent.
  const sends = (target: Person) => h.submit(h.form(internalPlan), target.account).then((response) => response);
  const holdsRole = async (target: Person) =>
    (
      await h.ctx.sql.query(
        `SELECT 1 FROM role_grants WHERE app_user_id = $1 AND role = 'SPENDING_APPROVER' AND revoked_at IS NULL`,
        [target.account.appUserId],
      )
    ).rowCount === 1;
  const openRequestsOf = async (target: Person) =>
    (
      await h.ctx.sql.query(
        `SELECT 1 FROM access_requests r
          WHERE r.state <> 'DRAFT'
            AND (r.requester_employee_id = $1
                 OR EXISTS (SELECT 1 FROM access_request_beneficiaries b WHERE b.request_id = r.id AND b.employee_id = $1))`,
        [target.employeeId],
      )
    ).rowCount ?? 0;

  it('sending first: the Request is made and the grant is refused because of it', async () => {
    const e7 = await person();
    await holdAccount(e7.account.appUserId);

    const sent = sends(e7);
    await waitForLockWaiters(h.ctx.sql, 1);
    const granted = grant(e7);
    await waitForLockWaiters(h.ctx.sql, 2);
    await holder.query('COMMIT');
    const [requestAnswer, grantAnswer] = await Promise.all([sent, granted]);

    expect(requestAnswer.status).toBe(201);
    expect(grantAnswer.status).toBe(409);
    expect(h.codeOf(grantAnswer)).toBe('APP_USER.SPENDING_APPROVER_HAS_OPEN_WORK');
    expect(await holdsRole(e7)).toBe(false);
    expect(await openRequestsOf(e7)).toBe(1);
  });

  it('granting first: the role is held and the Request is refused as one of its party', async () => {
    const e7 = await person();
    await holdAccount(e7.account.appUserId);

    const granted = grant(e7);
    await waitForLockWaiters(h.ctx.sql, 1);
    const sent = sends(e7);
    await waitForLockWaiters(h.ctx.sql, 2);
    await holder.query('COMMIT');
    const [grantAnswer, requestAnswer] = await Promise.all([granted, sent]);

    expect(grantAnswer.status).toBe(201);
    expect(requestAnswer.status).toBe(422);
    expect(h.codeOf(requestAnswer)).toBe('REQUEST_PARTY.INELIGIBLE');
    expect(await holdsRole(e7)).toBe(true);
    expect(await openRequestsOf(e7)).toBe(0);
  });
});
