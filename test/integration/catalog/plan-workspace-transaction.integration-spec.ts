import { Client } from 'pg';
import request from 'supertest';
import type { ApiAccount } from '../../support/api-accounts';
import { buildActivatedAccount } from '../../support/builders/account.builder';
import { declareApplication, declarePlan } from '../../support/builders/catalog.builder';
import { Barrier } from '../../support/concurrency-harness';
import { waitForLockWaiters } from '../../support/lock-wait';
import { SeatHarness } from '../../support/seat-baseline-harness';

const h = new SeatHarness();
const NO = { personToPersonMessaging: false, callsOrMeetings: false, mailbox: false };

describe('W3-13 plan workspace profile and PATCH /workspaces/:id single-tx atomicity (integration, real PostgreSQL)', () => {
  let khoa: ApiAccount;
  let nam: ApiAccount;
  let it3: ApiAccount;
  let it4: ApiAccount;

  const makeVendorAndPlan = async (label: string) => {
    const appId = await declareApplication(h.ctx, khoa.accessToken, {
      name: h.unique(`PWT-App-${label}`),
      kind: 'SAAS',
      vendorName: h.unique(`PWT-Vendor-${label}`),
      dataSensitivity: 'LOW',
      communication: NO,
    });
    const vendorId = (
      await h.ctx.sql.query<{ vendor_id: string }>('SELECT vendor_id FROM applications WHERE id = $1', [appId])
    ).rows[0].vendor_id;
    const planId = await declarePlan(h.ctx, khoa.accessToken, {
      applicationId: appId,
      name: h.unique(`PWT-Plan-${label}`),
      provisioningType: 'K2',
      pricingModel: 'PER_SEAT',
      controlLevel: 'FULL',
    });

    return { vendorId, planId };
  };

  beforeAll(async () => {
    await h.start();
    khoa = h.it1;
    nam = await buildActivatedAccount(h.ctx, h.seed, { code: 'E-PWT-2', email: 'pwt2@acme.vn', role: 'IT_ADMIN' });
    it3 = await buildActivatedAccount(h.ctx, h.seed, { code: 'E-PWT-3', email: 'pwt3@acme.vn', role: 'IT_ADMIN' });
    it4 = await buildActivatedAccount(h.ctx, h.seed, { code: 'E-PWT-4', email: 'pwt4@acme.vn', role: 'IT_ADMIN' });
  }, 240000);

  afterAll(async () => {
    await h.stop();
  });

  it('invalid emergency holder returns 422 with no orphan workspace created and leaves existing admins unchanged', async () => {
    // 1. Fresh vendor with no workspace yet
    const appId = await declareApplication(h.ctx, khoa.accessToken, {
      name: h.unique('PWT-NoWs-App'),
      kind: 'SAAS',
      vendorName: h.unique('PWT-NoWs-Vendor'),
      dataSensitivity: 'LOW',
      communication: NO,
    });
    const vendorId = (
      await h.ctx.sql.query<{ vendor_id: string }>('SELECT vendor_id FROM applications WHERE id = $1', [appId])
    ).rows[0].vendor_id;
    const planId = h.dataOf<{ id: string }>(
      await request(h.server())
        .post('/api/v1/plans')
        .set(h.as(khoa))
        .send({
          applicationId: appId,
          name: h.unique('PWT-NoWs-Plan'),
          provisioningType: 'K2',
          pricingModel: 'PER_SEAT',
          controlLevel: 'FULL',
        })
        .expect(201),
    ).id;

    const firstBad = await request(h.server())
      .put(`/api/v1/plans/${planId}/workspace-profile`)
      .set(h.as(khoa))
      .send({
        primaryOwnerEmployeeId: khoa.employeeId,
        members: [
          { employeeId: khoa.employeeId, role: 'OWNER' },
          { employeeId: nam.employeeId, role: 'ADMIN' },
        ],
        emergencyAccount: {
          identity: 'break-glass',
          occupiesSeat: false,
          holderEmployeeId: h.finance.employeeId,
          lastReviewedOn: '2026-11-01',
        },
      })
      .expect(422);
    expect(h.codeOf(firstBad)).toBe('PLAN.WORKSPACE_PERSON_INVALID');
    const wsCount = await h.ctx.sql.query<{ n: number }>(
      'SELECT count(*)::int AS n FROM workspaces WHERE vendor_id = $1',
      [vendorId],
    );
    expect(wsCount.rows[0].n).toBe(0);

    // 2. Existing workspace with [khoa, nam]: trying to change admins to [khoa, it3] with invalid emergency holder leaves [khoa, nam] intact
    await request(h.server())
      .put(`/api/v1/plans/${planId}/workspace-profile`)
      .set(h.as(khoa))
      .send({
        primaryOwnerEmployeeId: khoa.employeeId,
        members: [
          { employeeId: khoa.employeeId, role: 'OWNER' },
          { employeeId: nam.employeeId, role: 'ADMIN' },
        ],
      })
      .expect(200);

    const secondBad = await request(h.server())
      .put(`/api/v1/plans/${planId}/workspace-profile`)
      .set(h.as(khoa))
      .send({
        primaryOwnerEmployeeId: khoa.employeeId,
        members: [
          { employeeId: khoa.employeeId, role: 'OWNER' },
          { employeeId: it3.employeeId, role: 'ADMIN' },
        ],
        emergencyAccount: {
          identity: 'break-glass',
          occupiesSeat: false,
          holderEmployeeId: h.finance.employeeId,
          lastReviewedOn: '2026-11-01',
        },
      })
      .expect(422);
    expect(h.codeOf(secondBad)).toBe('PLAN.WORKSPACE_PERSON_INVALID');

    const adminsAfter = (
      await h.ctx.sql.query<{ employee_id: string }>(
        `SELECT wa.employee_id FROM workspace_admins wa
           JOIN workspaces w ON w.id = wa.workspace_id
          WHERE w.vendor_id = $1 ORDER BY wa.employee_id`,
        [vendorId],
      )
    ).rows.map((row) => row.employee_id);
    expect(adminsAfter).toEqual([khoa.employeeId, nam.employeeId].sort());
  });

  it('raises adminLimit from 2 to 4 alongside 4 admins in one PUT (200) and supports PATCH /workspaces/:id limits', async () => {
    const { vendorId, planId } = await makeVendorAndPlan('Limits');

    await request(h.server())
      .put(`/api/v1/plans/${planId}/workspace-profile`)
      .set(h.as(khoa))
      .send({
        primaryOwnerEmployeeId: khoa.employeeId,
        ownerLimit: 1,
        adminLimit: 1,
        members: [
          { employeeId: khoa.employeeId, role: 'OWNER' },
          { employeeId: nam.employeeId, role: 'ADMIN' },
        ],
      })
      .expect(200);

    const raised = await request(h.server())
      .put(`/api/v1/plans/${planId}/workspace-profile`)
      .set(h.as(khoa))
      .send({
        primaryOwnerEmployeeId: khoa.employeeId,
        ownerLimit: 1,
        adminLimit: 3,
        members: [
          { employeeId: khoa.employeeId, role: 'OWNER' },
          { employeeId: nam.employeeId, role: 'ADMIN' },
          { employeeId: it3.employeeId, role: 'ADMIN' },
          { employeeId: it4.employeeId, role: 'ADMIN' },
        ],
      })
      .expect(200);
    const body = h.dataOf<{ adminLimit: number; members: Array<{ employeeId: string }> }>(raised);
    expect(body.adminLimit).toBe(3);
    expect(body.members).toHaveLength(4);

    const wsRow = (
      await h.ctx.sql.query<{ id: string; updated_at: Date }>(
        'SELECT id, updated_at FROM workspaces WHERE vendor_id = $1',
        [vendorId],
      )
    ).rows[0];
    const patched = await request(h.server())
      .patch(`/api/v1/workspaces/${wsRow.id}`)
      .set(h.as(khoa))
      .send({ expectedUpdatedAt: wsRow.updated_at.toISOString(), adminLimit: 4 })
      .expect(200);
    expect(h.dataOf<{ adminLimit: number }>(patched).adminLimit).toBe(4);
  });

  it('returns 409 WORKSPACE.STALE when a second connection modifies the workspace while PUT workspace-profile or PATCH waits', async () => {
    const { vendorId, planId } = await makeVendorAndPlan('Stale');
    const wsId = (await h.ctx.sql.query<{ id: string }>('SELECT id FROM workspaces WHERE vendor_id = $1', [vendorId]))
      .rows[0].id;

    // 1. Concurrent modification during PUT /plans/:id/workspace-profile -> 409 WORKSPACE.STALE
    const locker = new Client({ connectionString: h.ctx.database.url });
    await locker.connect();
    try {
      await locker.query('BEGIN');
      await locker.query('SELECT id FROM workspaces WHERE id = $1 FOR UPDATE', [wsId]);

      const pendingPut = request(h.server())
        .put(`/api/v1/plans/${planId}/workspace-profile`)
        .set(h.as(khoa))
        .send({
          primaryOwnerEmployeeId: khoa.employeeId,
          members: [
            { employeeId: khoa.employeeId, role: 'OWNER' },
            { employeeId: nam.employeeId, role: 'ADMIN' },
          ],
          adminNote: 'From PUT',
        })
        .then((res) => res);

      await waitForLockWaiters(h.ctx.sql, 1);
      await locker.query(
        `UPDATE workspaces SET admin_note = 'From locker', updated_at = updated_at + interval '1 second' WHERE id = $1`,
        [wsId],
      );
      await locker.query('COMMIT');

      const putRes = await pendingPut;
      expect(putRes.status).toBe(409);
      expect(h.codeOf(putRes)).toBe('WORKSPACE.STALE');
    } finally {
      await locker.query('ROLLBACK').catch(() => undefined);
      await locker.end();
    }

    // 2. Two concurrent PATCH /workspaces/:id with same expectedUpdatedAt -> one 200, one 409 WORKSPACE.STALE
    const latest = (
      await h.ctx.sql.query<{ updated_at: Date }>('SELECT updated_at FROM workspaces WHERE id = $1', [wsId])
    ).rows[0].updated_at.toISOString();
    const barrier = new Barrier(2);
    const patchOne = (note: string) => async () => {
      await barrier.wait();
      return request(h.server())
        .patch(`/api/v1/workspaces/${wsId}`)
        .set(h.as(khoa))
        .send({ expectedUpdatedAt: latest, adminNote: note });
    };
    const [r1, r2] = await Promise.all([patchOne('Note A')(), patchOne('Note B')()]);
    expect([r1.status, r2.status].sort()).toEqual([200, 409]);
    const loser = r1.status === 409 ? r1 : r2;
    expect(h.codeOf(loser)).toBe('WORKSPACE.STALE');
  });
});
