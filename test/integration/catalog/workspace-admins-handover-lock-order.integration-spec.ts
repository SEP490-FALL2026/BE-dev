import request from 'supertest';
import { declareApplication } from '../../support/builders/catalog.builder';
import { Barrier } from '../../support/concurrency-harness';
import { OffboardingHarness } from '../../support/offboarding-harness';

const h = new OffboardingHarness();
const NO = { personToPersonMessaging: false, callsOrMeetings: false, mailbox: false };

const isDeadlockResponse = (response: request.Response): boolean => {
  const code = (response.body as { error?: { code?: unknown } } | undefined)?.error?.code;
  return code === '40P01' || JSON.stringify(response.body).includes('40P01');
};

describe('Workspace admins set and SBF-16 IT admin handover lock order (integration, real PostgreSQL)', () => {
  let vendorId: string;

  beforeAll(async () => {
    await h.start();
    const appId = await declareApplication(h.ctx, h.it1.accessToken, {
      name: h.unique('WAHO-App'),
      kind: 'SAAS',
      vendorName: h.unique('WAHO-Vendor'),
      dataSensitivity: 'LOW',
      communication: NO,
    });
    vendorId = (
      await h.ctx.sql.query<{ vendor_id: string }>('SELECT vendor_id FROM applications WHERE id = $1', [appId])
    ).rows[0].vendor_id;
  }, 300000);

  afterAll(async () => {
    await h.stop();
  });

  it('never deadlocks (0 x 40P01) across 20 concurrent SBF-16 handovers and workspaceAdminsSet naming the leaving IT Admin', async () => {
    const unit = await h.departmentWithHead('P-WAHO');
    const target = await h.worker(unit.department, 'WAHO-TARGET', ['IT_ADMIN']);

    for (let i = 0; i < 20; i += 1) {
      const leaver = await h.worker(unit.department, `WAHO-L-${i}`, ['IT_ADMIN']);
      const wsRes = await request(h.server())
        .post('/api/v1/workspaces')
        .set(h.as(leaver.account))
        .send({ vendorId, name: h.unique(`WAHO-WS-${i}`) })
        .expect(201);
      const ws = h.dataOf<{ id: string; updatedAt: string }>(wsRes);

      const subId = await h.subscription(5);
      await h.ctx.sql.query('UPDATE subscriptions SET responsible_it_admin_employee_id = $2 WHERE id = $1', [
        subId,
        leaver.employeeId,
      ]);

      const recorded = await h.recordedCase(leaver);
      const adminsOf = async (): Promise<string[]> =>
        (
          await h.ctx.sql.query<{ admin: string }>(
            `SELECT employee_id || ':' || role::text AS admin FROM workspace_admins WHERE workspace_id = $1 ORDER BY employee_id`,
            [ws.id],
          )
        ).rows.map((row) => row.admin);
      const adminsBefore = await adminsOf();
      const adminsRequested = [`${leaver.employeeId}:OWNER`, `${h.it1.employeeId}:ADMIN`].sort();

      const barrier = new Barrier(2);
      const handoverTask = (async () => {
        await barrier.wait();
        return request(h.server())
          .post(`/api/v1/offboarding-cases/${recorded.id}/it-admin-handover`)
          .set(h.as(h.sa))
          .send({ toItAdminEmployeeId: target.employeeId });
      })();
      const adminsSetTask = (async () => {
        await barrier.wait();
        return request(h.server())
          .put(`/api/v1/workspaces/${ws.id}/admins`)
          .set(h.as(leaver.account))
          .send({
            admins: [
              { employeeId: leaver.employeeId, role: 'OWNER' },
              { employeeId: h.it1.employeeId, role: 'ADMIN' },
            ],
            primaryOwnerEmployeeId: leaver.employeeId,
            expectedUpdatedAt: ws.updatedAt,
          });
      })();

      const [handoverOutcome, adminsOutcome] = await Promise.allSettled([handoverTask, adminsSetTask]);
      expect(handoverOutcome.status).toBe('fulfilled');
      expect(adminsOutcome.status).toBe('fulfilled');
      if (handoverOutcome.status === 'fulfilled') {
        expect(isDeadlockResponse(handoverOutcome.value)).toBe(false);
        expect(handoverOutcome.value.status).toBe(200);
      }
      if (adminsOutcome.status === 'fulfilled') {
        expect(isDeadlockResponse(adminsOutcome.value)).toBe(false);
        expect([200, 403]).toContain(adminsOutcome.value.status);
      }
      // Whatever the order, the hand-over moved the workspace to the IT Admin who took it, and the admins are the ones asked for (the set came
      // first) or the ones there were (the leaver no longer answers for the workspace when the set came second): never a mix.
      const responsible = await h.ctx.sql.query<{ responsible: string | null }>(
        'SELECT responsible_it_admin_employee_id AS responsible FROM workspaces WHERE id = $1',
        [ws.id],
      );
      expect(responsible.rows[0].responsible).toBe(target.employeeId);
      if (adminsOutcome.status === 'fulfilled') {
        expect(await adminsOf()).toEqual(adminsOutcome.value.status === 200 ? adminsRequested : adminsBefore);
      }
    }
  });
});
