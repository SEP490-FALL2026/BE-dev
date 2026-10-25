import request from 'supertest';
import { RequestsService } from '../../src/modules/requests/requests.service';
import { GroupHarness } from '../support/group-harness';

const h = new GroupHarness();

/**
 * US-03-04 AC-24, AC-25 for a request for a group (`g5-group-requests`): one person of it leaving is listed with the flag and may be removed
 * from their own line (`group-line-closure.integration-spec.ts`); the request as a whole is refused while more than one person is live.
 */
describe('a person who left in a request for a group (integration, real PostgreSQL)', () => {
  let paid: string;

  beforeAll(async () => {
    await h.start();
    await h.withApprover();
    paid = await h.planOf(await h.subscription(100));
  }, 240000);

  afterAll(async () => {
    await h.stop();
  });

  it('lists the request with the flag of a group as one the IT Admin may close for the person, and refuses to close the whole while two people are live', async () => {
    const u = await h.departmentWithHead('P-LG1');
    await h.roomFor(u);
    const [leaver, other] = await h.colleagues(u, 2);
    const id = await h.groupApproved(u, paid, [leaver, other]);
    await h.ctx.sql.query(`UPDATE employees SET status = 'TERMINATED' WHERE id = $1`, [leaver.employeeId]);

    const listed = await h.ctx.app
      .get(RequestsService, { strict: false })
      .listOpenOfBeneficiary(leaver.employeeId, { skip: 0, take: 10 });

    expect(listed.total).toBe(1);
    expect(listed.items[0]).toMatchObject({ requestId: id, type: 'GROUP_GRANT', group: true, cancellable: true });
    const refused = await request(h.server())
      .post(`/api/v1/access-requests/${id}/cancellation`)
      .set(h.as(h.it1))
      .send({ cause: 'BENEFICIARY_LEFT' })
      .expect(409);
    expect(h.codeOf(refused)).toBe('ACCESS_REQUEST.GROUP_REQUEST_UNSUPPORTED');
    expect(await h.state(id)).not.toBe('CANCELLED');
    const lines = await h.ctx.sql.query<{ state: string }>(
      `SELECT state::text FROM access_request_lines WHERE request_id = $1 ORDER BY state`,
      [id],
    );
    expect(lines.rows.map((row) => row.state)).toEqual(['APPROVED', 'APPROVED']);
  });
});
