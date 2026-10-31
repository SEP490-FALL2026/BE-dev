import request from 'supertest';
import type { DbTx } from '../../../src/infrastructure/database/transaction-runner';
import {
  SeatBaselineClosedListeners,
  type SeatBaselineClosedEvent,
} from '../../../src/modules/licensing/public/licensing.extension-points';
import { ProvisioningHarness } from '../../support/provisioning-harness';

const h = new ProvisioningHarness();

/**
 * F21 (`QĐ-89e`, spec D): step 4 of the installation writes the seats of people of another department on the subscription of the
 * department that owns it; when the IT Admin closes the step, the modules registered for it (personnel, which opens the review decided by
 * the head of the department of each holder) are told, in the transaction of the closing, which people hold a seat on a subscription of
 * another department than their own. A fake listener stands for personnel.
 */
describe('closing the seat baseline tells who holds a seat of another department (integration, F21, real PostgreSQL)', () => {
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
      ['D1', design],
      ['D2', design],
      ['F1', finance],
    ] as const) {
      people[code] = await h.member(department.code, code, 'Staff');
    }
    h.ctx.app
      .get(SeatBaselineClosedListeners, { strict: false })
      .add('test.recorder', (tx, event) => listener.baselineClosed(tx, event));
    const figma = await h.subscription(10, 'K2', design.id);
    const slack = await h.subscription(10, 'K2', finance.id);
    // Figma is design's: two of its own people and a person of finance; Slack is finance's: its own person and a person of design.
    await h.written({ subscriptionId: figma }, [seat('D1', 'figma'), seat('D2', 'figma'), seat('F1', 'figma')]);
    await h.written({ subscriptionId: slack }, [seat('F1', 'slack'), seat('D1', 'slack')]);
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

  it('tells every listener once, in the transaction of the closing, only the people who hold a seat on a subscription of another department', async () => {
    const response = await h.closeBaseline().expect(200);

    expect(h.dataOf<{ closed: boolean; alreadyClosed: boolean }>(response)).toMatchObject({
      closed: true,
      alreadyClosed: false,
    });
    expect(events).toHaveLength(1);
    const [event] = events;
    expect(event.organizationId).toBe(h.seed.organizationId);
    expect(event.closedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // D2 holds the seat of its own department's subscription: not asked. D1 holds one seat of Slack (finance's), F1 one of Figma (design's).
    expect(event.holders).toHaveLength(2);
    const byPerson = new Map(event.holders.map((holder) => [holder.employeeId, holder]));
    expect(byPerson.get(people.D1)).toMatchObject({
      employeeDepartmentId: design.id,
      assignments: [{ owningDepartmentId: finance.id }],
    });
    expect(byPerson.get(people.F1)).toMatchObject({
      employeeDepartmentId: finance.id,
      assignments: [{ owningDepartmentId: design.id }],
    });
    expect(byPerson.has(people.D2)).toBe(false);
    expect(event.holders.map((holder) => holder.employeeId)).toEqual(
      [...event.holders.map((holder) => holder.employeeId)].sort(),
    );
    // In the transaction of the closing: it sees the baseline closed, and nobody else does until it commits.
    expect(inClosingTransaction).toEqual({ seenInside: expect.anything() as unknown, seenOutside: null });
    const [closing] = await h.auditOf('SeatBaseline');
    expect(closing).toMatchObject({
      action: 'SEAT_BASELINE.CLOSED',
      after: { closed: true, holdersOfOtherDepartments: 2 },
    });
  });

  it('tells nobody again when the baseline is closed again', async () => {
    const again = await h.closeBaseline().expect(200);

    expect(h.dataOf<{ alreadyClosed: boolean }>(again).alreadyClosed).toBe(true);
    expect(events).toHaveLength(1);
  });
});
