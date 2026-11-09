import request from 'supertest';
import type { DbTx } from '../../../src/infrastructure/database/transaction-runner';
import {
  SeatBaselineClosedListeners,
  type SeatBaselineClosedEvent,
} from '../../../src/modules/licensing/public/licensing.extension-points';
import { ProvisioningHarness } from '../../support/provisioning-harness';

const h = new ProvisioningHarness();

/**
 * F21 (`QĐ-89e`) as `BR-MF1-09` / `QĐ-103d` changed it: the seats of every subscription of a K2 or K4 plan are one pool shared by all
 * departments, so there is no longer "a seat on the subscription of another department" to review. Closing step 4 of the installation
 * still tells the registered listeners, in the transaction of the closing, but with `holders: []` and the audit of the closing says
 * `holdersOfOtherDepartments: 0`; personnel therefore opens no `POST_SETUP_REVIEW`. (Rewritten: the expectation of two holders became none,
 * the cases are kept.) A fake listener stands for personnel.
 */
describe('closing the seat baseline tells the listeners, and no seat of another department is reviewed (integration, F21, real PostgreSQL)', () => {
  let design: { id: string; code: string };
  let finance: { id: string; code: string };
  const people: Record<string, string> = {};
  const events: SeatBaselineClosedEvent[] = [];
  let inClosingTransaction: { seenInside: unknown; seenOutside: unknown } | null = null;
  let fail = false;

  const listener = {
    async baselineClosed(tx: DbTx, event: SeatBaselineClosedEvent) {
      const inside = await tx.$queryRaw<{ closed_at: Date | null }[]>`SELECT closed_at FROM seat_baseline_states`;
      const outside = await h.ctx.sql.query<{ closed_at: Date | null }>(`SELECT closed_at FROM seat_baseline_states`);
      inClosingTransaction = {
        seenInside: inside[0]?.closed_at ?? null,
        seenOutside: outside.rows[0]?.closed_at ?? null,
      };
      events.push(event);
      if (fail) throw new Error('the review could not be opened');
    },
  };
  const seat = (code: string, prefix: string) => ({
    employee_code: code,
    account_identifier: `${prefix}-${code.toLowerCase()}@acme.vn`,
  });
  const state = async () =>
    h.dataOf<{ closed: boolean }>(await request(h.server()).get('/api/v1/seat-baseline').set(h.as(h.it1)).expect(200))
      .closed;

  beforeAll(async () => {
    await h.start();
    design = await h.department('P-DES');
    finance = await h.department('P-FIN');
    for (const [code, department] of [
      ['D-1', design],
      ['D-2', design],
      ['F-1', finance],
    ] as const) {
      people[code] = await h.member(department.code, code, 'Staff');
    }
    h.ctx.app
      .get(SeatBaselineClosedListeners, { strict: false })
      .add('test.recorder', (tx, event) => listener.baselineClosed(tx, event));
    const figma = await h.subscription(10, 'K2', design.id);
    const slack = await h.subscription(10, 'K2', finance.id);
    // Figma is design's: two of its own people and a person of finance; Slack is finance's: its own person and a person of design. Before the
    // shared pool this was two people to review; now it is none.
    await h.written({ subscriptionId: figma }, [seat('D-1', 'figma'), seat('D-2', 'figma'), seat('F-1', 'figma')]);
    await h.written({ subscriptionId: slack }, [seat('F-1', 'slack'), seat('D-1', 'slack')]);
  }, 300000);

  afterAll(async () => {
    await h.stop();
  });

  it('rolls the closing back when a listener refuses: the baseline stays open and nothing is audited', async () => {
    fail = true;

    const response = await h.closeBaseline();

    expect(response.status).toBe(500);
    expect(await state()).toBe(false);
    expect((await h.auditOf('SeatBaseline')).map((event) => event.action)).toEqual([]);
    fail = false;
    events.length = 0;
  });

  it('tells every listener once, in the transaction of the closing, with no holder of another department (the pool is shared)', async () => {
    const response = await h.closeBaseline().expect(200);

    expect(h.dataOf<{ closed: boolean; alreadyClosed: boolean }>(response)).toMatchObject({
      closed: true,
      alreadyClosed: false,
    });
    expect(events).toHaveLength(1);
    const [event] = events;
    expect(event.organizationId).toBe(h.seed.organizationId);
    expect(event.closedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // D1 on Slack (finance's) and F1 on Figma (design's) are not holders to review: a seat of the pool is every department's.
    expect(event.holders).toEqual([]);
    // In the transaction of the closing: it sees the baseline closed, and nobody else does until it commits.
    expect(inClosingTransaction).toEqual({ seenInside: expect.anything() as unknown, seenOutside: null });
    const [closing] = await h.auditOf('SeatBaseline');
    expect(closing).toMatchObject({
      action: 'SEAT_BASELINE.CLOSED',
      after: { closed: true, holdersOfOtherDepartments: 0 },
    });
  });

  it('tells nobody again when the baseline is closed again', async () => {
    const again = await h.closeBaseline().expect(200);

    expect(h.dataOf<{ alreadyClosed: boolean }>(again).alreadyClosed).toBe(true);
    expect(events).toHaveLength(1);
  });
});
