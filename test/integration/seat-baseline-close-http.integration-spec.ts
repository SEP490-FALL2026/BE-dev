import request from 'supertest';
import { OrganizationService } from '../../src/modules/organization/organization.service';
import { SeatHarness } from '../support/seat-baseline-harness';

const h = new SeatHarness();
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('closing the seat baseline over HTTP (integration, real PostgreSQL)', () => {
  beforeAll(async () => {
    await h.start();
    jest.spyOn(h.ctx.app.get(OrganizationService, { strict: false }), 'businessToday').mockResolvedValue('2026-10-01');
  }, 180000);

  afterAll(async () => {
    jest.restoreAllMocks();
    await h.stop();
  });

  it('closes after a confirmation that is in flight: the IT Admin closing waits for it (AC-6)', async () => {
    const before = await request(h.server()).get('/api/v1/seat-baseline').set(h.as(h.it1)).expect(200);
    expect(h.dataOf(before)).toEqual({ closed: false, closedAt: null });

    await h.ctx.sql.query('BEGIN');
    let closing!: Promise<request.Response>;
    try {
      // What a confirmation holds while it writes: the state of the baseline FOR SHARE.
      await h.ctx.sql.query(`INSERT INTO seat_baseline_states (organization_id) VALUES ($1) ON CONFLICT DO NOTHING`, [
        h.seed.organizationId,
      ]);
      await h.ctx.sql.query(`SELECT 1 FROM seat_baseline_states WHERE organization_id = $1 FOR SHARE`, [
        h.seed.organizationId,
      ]);
      await h.ctx.sql.query('COMMIT');
      await h.ctx.sql.query('BEGIN');
      await h.ctx.sql.query(`SELECT 1 FROM seat_baseline_states WHERE organization_id = $1 FOR SHARE`, [
        h.seed.organizationId,
      ]);
      closing = h.closeBaseline().then((response) => response);
      let settled = false;
      void closing.then(() => {
        settled = true;
      });
      await wait(500);
      expect(settled).toBe(false);
    } finally {
      await h.ctx.sql.query('COMMIT');
    }

    const response = await closing;
    expect(response.status).toBe(200);
    expect(h.dataOf<{ closed: boolean; alreadyClosed: boolean }>(response)).toMatchObject({
      closed: true,
      alreadyClosed: false,
    });
  });

  it('audits the closing once, with who and when, and closing again writes nothing more', async () => {
    const closed = h.dataOf<{ closedAt: string }>(
      await request(h.server()).get('/api/v1/seat-baseline').set(h.as(h.it1)).expect(200),
    );
    const again = h.dataOf<{ closedAt: string; alreadyClosed: boolean }>(await h.closeBaseline().expect(200));

    expect(again).toEqual({ closed: true, closedAt: closed.closedAt, alreadyClosed: true });
    const events = await h.auditOf('SeatBaseline');
    expect(events.map((event) => event.action)).toEqual(['SEAT_BASELINE.CLOSED']);
    expect(events[0]).toMatchObject({ before: { closed: false }, after: { closed: true }, actor_roles: ['IT_ADMIN'] });
  });

  it('never reopens: the database refuses to change or delete a closed baseline', async () => {
    await expect(
      h.ctx.sql.query(
        `UPDATE seat_baseline_states SET closed_at = NULL, closed_by_app_user_id = NULL WHERE organization_id = $1`,
        [h.seed.organizationId],
      ),
    ).rejects.toMatchObject({ code: '55000' });
    await expect(
      h.ctx.sql.query(`DELETE FROM seat_baseline_states WHERE organization_id = $1`, [h.seed.organizationId]),
    ).rejects.toMatchObject({ code: '55000' });
  });
});
