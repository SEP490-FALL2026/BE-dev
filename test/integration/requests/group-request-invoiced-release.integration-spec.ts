import request from 'supertest';
import { GroupHarness } from '../../support/group-harness';
import type { Unit } from '../../support/spend-harness';

const h = new GroupHarness();

/**
 * A person of a request for a group leaves after Finance has recorded an invoice against its commitment (`US-06-06` AC-9, AC-4): the
 * share of the person can reach into what the invoice made an expense. The withdrawal gives back only what is still held, and
 * does not fail because the share is more than that.
 */
describe('a person of a group leaves after an invoice was recorded over PostgreSQL (US-06-06 AC-9, US-05-17 AC-10)', () => {
  let paid: string;
  let counter = 0;

  beforeAll(async () => {
    await h.start();
    await h.withApprover();
    paid = await h.planOf(await h.subscription(100));
  }, 240000);

  afterAll(async () => {
    await h.stop();
  });

  const approved = async (count = 4) => {
    counter += 1;
    const u: Unit = await h.departmentWithHead(`P-IV${counter}`);
    await h.roomFor(u);
    const people = await h.colleagues(u, count);
    const id = await h.groupApproved(u, paid, people);
    const [commitment] = (
      await h.ctx.sql.query<{ id: string; amount_minor: string }>(
        `SELECT id, amount_minor::text FROM budget_commitments WHERE request_id = $1`,
        [id],
      )
    ).rows;

    return { u, people, id, commitmentId: commitment.id, amount: BigInt(commitment.amount_minor) };
  };
  const invoice = (commitmentId: string, netMinor: bigint) =>
    request(h.server())
      .post(`/api/v1/budget-commitments/${commitmentId}/invoices`)
      .set(h.as(h.finance))
      .send({ number: `GRP-${commitmentId}`, issuedOn: '2026-11-03', netAmount: { amount: netMinor.toString() } });
  const commitmentRow = async (id: string) =>
    (
      await h.ctx.sql.query<{ state: string; released_minor: string; applied_minor: string }>(
        `SELECT state::text, released_minor::text, applied_minor::text FROM budget_commitments WHERE id = $1`,
        [id],
      )
    ).rows[0];
  const releases = async (commitmentId: string) =>
    (
      await h.ctx.sql.query<{ reason: string; amount_minor: string }>(
        `SELECT reason::text, amount_minor::text FROM budget_commitment_releases WHERE commitment_id = $1 ORDER BY id`,
        [commitmentId],
      )
    ).rows;
  const shareReleased = async (id: string, employeeId: string) =>
    (await h.shares(id)).filter((row) => row.employee_id === employeeId).every((row) => row.released_at !== null);

  it('gives back only what is still held when the share is more, and the commitment becomes an expense', async () => {
    const { u, people, id, commitmentId, amount } = await approved();
    const net = (amount * 9n) / 10n;
    await invoice(commitmentId, net).expect(201);

    await h.withdrawLine(id, people[3].employeeId, {}, u.head.account).expect(200);

    // The person's share is a quarter; the invoice left a tenth held, which is all that goes back.
    expect(await releases(commitmentId)).toEqual([
      { reason: 'PARTICIPANT_WITHDRAWN', amount_minor: (amount - net).toString() },
    ]);
    expect(await commitmentRow(commitmentId)).toEqual({
      state: 'EXPENSED',
      released_minor: (amount - net).toString(),
      applied_minor: net.toString(),
    });
    expect(await h.lineStates(id)).toEqual(['APPROVED', 'APPROVED', 'APPROVED', 'WITHDRAWN']);
    expect(await shareReleased(id, people[3].employeeId)).toBe(true);
  });

  it('is not refused when the invoice already took the whole commitment: nothing goes back and the line still ends', async () => {
    const { u, people, id, commitmentId, amount } = await approved();
    await invoice(commitmentId, amount).expect(201);

    await h.withdrawLine(id, people[0].employeeId, {}, u.head.account).expect(200);

    expect(await releases(commitmentId)).toEqual([]);
    expect(await commitmentRow(commitmentId)).toMatchObject({ state: 'EXPENSED', released_minor: '0' });
    expect(await h.lineStates(id)).toEqual(['WITHDRAWN', 'APPROVED', 'APPROVED', 'APPROVED']);
    expect(await shareReleased(id, people[0].employeeId)).toBe(true);
  });

  it('gives back the share in full when the invoice took less than what is left over', async () => {
    const { u, people, id, commitmentId, amount } = await approved();
    const net = amount / 10n;
    await invoice(commitmentId, net).expect(201);

    await h.withdrawLine(id, people[1].employeeId, {}, u.head.account).expect(200);

    // A quarter goes back, nine tenths minus a quarter is still held.
    expect(await releases(commitmentId)).toEqual([
      { reason: 'PARTICIPANT_WITHDRAWN', amount_minor: (amount / 4n).toString() },
    ]);
    expect(await commitmentRow(commitmentId)).toMatchObject({ state: 'HELD', applied_minor: net.toString() });
  });

  it('gives back what is left of the commitment when the whole request is withdrawn after an invoice', async () => {
    const { u, id, commitmentId, amount } = await approved();
    const net = (amount * 6n) / 10n;
    await invoice(commitmentId, net).expect(201);

    await h.withdrawRequest(id, { reason: 'The project was cancelled' }, u.head.account).expect(200);

    expect(await commitmentRow(commitmentId)).toEqual({
      state: 'EXPENSED',
      released_minor: (amount - net).toString(),
      applied_minor: net.toString(),
    });
  });
});
