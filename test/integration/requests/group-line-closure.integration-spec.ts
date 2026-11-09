import { RequestsApi } from '../../../src/modules/requests/public/requests.api';
import { GroupHarness } from '../../support/group-harness';
import type { Person } from '../../support/request-harness';
import type { Unit } from '../../support/spend-harness';

const h = new GroupHarness();
const M = 1_000_000;
/** The months of a request that names no end date: the months left of the year, the month of today counted whole (`BR-MF1-06`). */
const monthsLeft = h.monthsOf(12);
const CHECK = '23514';
const FINAL = '55000';

interface TaskWire {
  id: string;
  status: string;
}
interface RequestWire {
  id: string;
  state: string;
  cancellation: { cancelledBy: { employeeId: string }; cause: string; note: string | null } | null;
}

/** The SQLSTATE a rejected statement carries: the constraint, not the application, said no. */
async function sqlState(text: string, values: unknown[] = []): Promise<string | null> {
  try {
    await h.ctx.sql.query(text, values);

    return null;
  } catch (error) {
    return (error as { code?: string }).code ?? 'unknown';
  }
}

/**
 * A person of a request for a group left, and the IT Admin removes that one line without ending the request for the others
 * (`US-03-04` AC-25, `US-05-17`), over HTTP, on real PostgreSQL: the line is cancelled with the cause, only that person's task and share
 * go, the request closes only with its last live line, and each person is told only of their own line.
 */
describe('removing a person who left from a request for a group (integration, real PostgreSQL)', () => {
  let subscriptionId: string;
  let paid: string;
  let counter = 0;

  beforeAll(async () => {
    await h.start();
    await h.withApprover();
    subscriptionId = await h.subscription(100);
    paid = await h.planOf(subscriptionId);
  }, 240000);

  afterAll(async () => {
    await h.stop();
  });

  const unit = async (): Promise<Unit> => {
    counter += 1;
    const made = await h.departmentWithHead(`P-LC${counter}`);
    await h.roomFor(made);

    return made;
  };
  const approved = async (count = 3) => {
    const u = await unit();
    const people = await h.colleagues(u, count);

    return { u, people, id: await h.groupApproved(u, paid, people) };
  };
  const granted = async (id: string, employeeId: string) =>
    h.dataOf<{ task: TaskWire }>(
      await h.grantLine({ requestId: id, beneficiaryEmployeeId: employeeId, subscriptionId }, h.it1).expect(201),
    ).task;
  const sum = (rows: Array<{ amount_minor: string }>) =>
    rows.reduce((total, row) => total + BigInt(row.amount_minor), 0n);
  const releases = async (id: string) =>
    (
      await h.ctx.sql.query<{ reason: string; amount_minor: string }>(
        `SELECT r.reason::text, r.amount_minor::text FROM budget_commitment_releases r
           JOIN budget_commitments c ON c.id = r.commitment_id WHERE c.request_id = $1 ORDER BY r.id`,
        [id],
      )
    ).rows;
  const tasks = async (id: string) =>
    (
      await h.ctx.sql.query<{
        status: string;
        close_reason: string | null;
        cancelled_at: Date | null;
        employee_id: string;
      }>(
        `SELECT t.status::text, t.close_reason, a.cancelled_at, a.employee_id
           FROM provisioning_tasks t JOIN license_assignments a ON a.id = t.assignment_id
          WHERE t.request_id = $1 ORDER BY a.employee_id`,
        [id],
      )
    ).rows;
  const shareOf = async (id: string, employeeId: string) =>
    (await h.shares(id)).filter((row) => row.employee_id === employeeId);
  const note = { cause: 'BENEFICIARY_LEFT', note: 'Left the company on Friday' };

  describe('before the spend there is no money to give back', () => {
    it('cancels the line of the person and prices the request again for those who remain, and the others are decided as they were', async () => {
      const u = await unit();
      const [e1, e2, e3] = await h.colleagues(u, 3);
      const id = await h.groupWaiting(u, paid, [e1, e2, e3]);
      await h.depart(e3);

      const closed = await h.closeLineForDeparture(id, e3.employeeId, note, h.it1).expect(200);

      expect(await h.lineStates(id)).toEqual(['NEED_CONFIRMED', 'NEED_CONFIRMED', 'CANCELLED']);
      const rows = await h.lineRows(id);
      expect(rows[2]).toMatchObject({
        ended_by_employee_id: h.it1.employeeId,
        end_reason: 'Left the company on Friday',
        cancel_cause: 'BENEFICIARY_LEFT',
      });
      expect(rows[0].cancel_cause).toBeNull();
      const wire = h.dataOf<{ request: { state: string; pricing: { amount: { amount: string } } } }>(closed).request;
      expect(wire.state).toBe('AWAITING_SPEND_DECISION');
      expect(wire.pricing.amount.amount).toBe(String(2 * M * monthsLeft));
      expect(await h.commitments(id)).toEqual([]);
      const all = [e1, e2, e3].map((p) => ({ employeeId: p.employeeId, decision: 'APPROVE' }));
      expect(h.codeOf(await h.decideSpendLines(id, { lines: all }, h.boss.account).expect(422))).toBe(
        'GROUP_REQUEST.LINES_MISMATCH',
      );
      await h.decideSpendLines(id, { lines: all.slice(0, 2) }, h.boss.account).expect(200);
      expect(await h.lineStates(id)).toEqual(['APPROVED', 'APPROVED', 'CANCELLED']);
    });

    it('shows the state and the cause on the list of the people, and the audit event of the line', async () => {
      const u = await unit();
      const [e1, e2] = await h.colleagues(u, 2);
      const id = await h.groupWaiting(u, paid, [e1, e2]);
      await h.depart(e2);
      await h.closeLineForDeparture(id, e2.employeeId, { cause: 'BENEFICIARY_LEFT' }, h.it1).expect(200);

      const listed = h.dataOf<{
        items: Array<{
          employee: { employeeId: string };
          state: string;
          cancelCause: string | null;
          endedBy: { employeeId: string } | null;
          endReason: string | null;
        }>;
      }>(await h.linesOf(id, h.it1).expect(200)).items;

      expect(listed.map((line) => [line.state, line.cancelCause])).toEqual([
        ['NEED_CONFIRMED', null],
        ['CANCELLED', 'BENEFICIARY_LEFT'],
      ]);
      expect(listed[1]).toMatchObject({ endedBy: { employeeId: h.it1.employeeId }, endReason: null });
      const event = (await h.trail(id)).find((row) => row.action === 'ACCESS_REQUEST.LINE_CANCELLED');
      expect(event?.after).toMatchObject({
        beneficiaryEmployeeId: e2.employeeId,
        from: 'NEED_CONFIRMED',
        to: 'CANCELLED',
        reasonKind: 'BENEFICIARY_LEFT',
        released: false,
      });
    });
  });

  describe('once the spend is approved only the share of the person goes back', () => {
    it('gives back exactly the share of the person who left, and nobody else’s', async () => {
      const { people, id } = await approved(4);
      const [, , , e4] = people;
      const share = await shareOf(id, e4.employeeId);
      const held = sum(await h.commitments(id));
      await h.depart(e4);

      await h.closeLineForDeparture(id, e4.employeeId, note, h.it1).expect(200);

      expect(await h.lineStates(id)).toEqual(['APPROVED', 'APPROVED', 'APPROVED', 'CANCELLED']);
      const given = await releases(id);
      expect(given.every((row) => row.reason === 'REQUEST_CANCELLED')).toBe(true);
      expect(sum(given)).toBe(sum(share));
      expect(sum(given) * 4n).toBe(held);
      expect((await h.shares(id)).filter((row) => row.released_at !== null).map((row) => row.employee_id)).toEqual(
        share.map((row) => row.employee_id),
      );
      expect(await h.state(id)).toBe('AWAITING_EXECUTION');
      const audit = (await h.trail(id)).find((row) => row.action === 'ACCESS_REQUEST.LINE_CANCELLED');
      expect(audit?.after).toMatchObject({ released: true, from: 'APPROVED' });
    });

    it('cancels the task of the person with its assignment and leaves the task of the others alone', async () => {
      const { people, id } = await approved(3);
      const [e1, e2] = people;
      await granted(id, e1.employeeId);
      await granted(id, e2.employeeId);
      await h.depart(e2);

      await h.closeLineForDeparture(id, e2.employeeId, note, h.it1).expect(200);

      expect(await h.lineStates(id)).toEqual(['EXECUTING', 'CANCELLED', 'APPROVED']);
      const rows = await tasks(id);
      const mine = rows.find((row) => row.employee_id === e2.employeeId);
      const theirs = rows.find((row) => row.employee_id === e1.employeeId);
      expect(mine).toMatchObject({ status: 'CANCELLED', close_reason: 'BENEFICIARY_LEFT' });
      expect(mine?.cancelled_at).not.toBeNull();
      expect(theirs).toMatchObject({ status: 'QUEUED', cancelled_at: null });
      expect(await h.state(id)).toBe('EXECUTING');
    });

    it('cancels a task that is being worked only with the evidence that the work was undone', async () => {
      const { people, id } = await approved(2);
      const [e1, e2] = people;
      const running = await granted(id, e1.employeeId);
      await granted(id, e2.employeeId);
      await h.claim(running.id).expect(200);
      await h.depart(e1);

      const refused = await h.closeLineForDeparture(id, e1.employeeId, note, h.it1).expect(422);

      expect(h.codeOf(refused)).toBe('ACCESS_REQUEST.EVIDENCE_REQUIRED');
      expect(await h.lineStates(id)).toEqual(['EXECUTING', 'EXECUTING']);
      expect(await releases(id)).toEqual([]);
      expect((await tasks(id)).map((row) => row.status).sort()).toEqual(['IN_PROGRESS', 'QUEUED']);

      await h
        .closeLineForDeparture(id, e1.employeeId, { ...note, evidence: 'Took the invitation back' }, h.it1)
        .expect(200);

      expect(await h.lineStates(id)).toEqual(['CANCELLED', 'EXECUTING']);
      expect((await tasks(id)).map((row) => row.status).sort()).toEqual(['CANCELLED', 'QUEUED']);
      expect((await releases(id)).length).toBeGreaterThan(0);
    });

    it('does not touch a person whose seat is real: the line is over, and the way back is the revocation of the departure', async () => {
      const { people, id } = await approved(2);
      const [e1] = people;
      const done = await granted(id, e1.employeeId);
      await h.claim(done.id).expect(200);
      await h.complete(done.id, { evidence: 'Invited by work email' }).expect(200);
      await h.depart(e1);

      const refused = await h.closeLineForDeparture(id, e1.employeeId, note, h.it1).expect(409);

      expect(h.codeOf(refused)).toBe('ACCESS_REQUEST.ALREADY_ENDED');
      expect(await h.lineStates(id)).toEqual(['COMPLETED', 'APPROVED']);
      // The refused closure gives nothing back; only the days before the K2 grant of the seat went back when it was completed (M-10).
      expect((await releases(id)).filter((row) => row.reason !== 'LATE_GRANT')).toEqual([]);
    });
  });

  describe('the request closes only when no line is live', () => {
    it('ends as cancelled with who closed it when the last line is closed, gives back everything and closes the steps', async () => {
      const { people, id } = await approved(2);
      const [e1, e2] = people;
      const held = sum(await h.commitments(id));
      await h.depart(e1);
      await h.depart(e2);

      await h.closeLineForDeparture(id, e1.employeeId, note, h.it1).expect(200);
      expect(await h.state(id)).toBe('AWAITING_EXECUTION');
      const last = h.dataOf<{ request: RequestWire }>(
        await h.closeLineForDeparture(id, e2.employeeId, note, h.it1).expect(200),
      ).request;

      expect(last.state).toBe('CANCELLED');
      expect(last.cancellation).toMatchObject({
        cause: 'BENEFICIARY_LEFT',
        note: 'Left the company on Friday',
        cancelledBy: { employeeId: h.it1.employeeId },
      });
      expect(await h.lineStates(id)).toEqual(['CANCELLED', 'CANCELLED']);
      expect(sum(await releases(id))).toBe(held);
      const resolved = (await h.trail(id)).find((row) => row.action === 'ACCESS_REQUEST.GROUP_RESOLVED');
      expect(resolved?.after).toMatchObject({ to: 'CANCELLED' });
    });

    it('ends as completed when the others were granted, as the most that was done, not as cancelled', async () => {
      const { people, id } = await approved(2);
      const [e1, e2] = people;
      const done = await granted(id, e1.employeeId);
      await h.claim(done.id).expect(200);
      await h.complete(done.id, { evidence: 'Invited by work email' }).expect(200);
      await h.depart(e2);

      await h.closeLineForDeparture(id, e2.employeeId, note, h.it1).expect(200);

      expect(await h.lineStates(id)).toEqual(['COMPLETED', 'CANCELLED']);
      expect(await h.state(id)).toBe('COMPLETED');
    });

    it('ends as cancelled when the others had been withdrawn before', async () => {
      const { u, people, id } = await approved(2);
      const [e1, e2] = people;
      await h.withdrawLine(id, e1.employeeId, {}, u.head.account).expect(200);
      await h.depart(e2);

      await h.closeLineForDeparture(id, e2.employeeId, note, h.it1).expect(200);

      expect(await h.lineStates(id)).toEqual(['WITHDRAWN', 'CANCELLED']);
      expect(await h.state(id)).toBe('CANCELLED');
    });

    it('closes the need step that nobody waits on any more, and the request, when the last person who waits leaves', async () => {
      const u = await unit();
      const [e1, e2] = await h.colleagues(u, 2);
      const id = h.dataOf<{ request: { id: string } }>(
        await h.submitGroup(h.groupBody(paid, [e1, e2]), e1.account).expect(201),
      ).request.id;
      await h.depart(e1);
      await h.depart(e2);

      await h.closeLineForDeparture(id, e2.employeeId, note, h.it1).expect(200);
      expect(await h.state(id)).toBe('PENDING');
      expect((await h.needSteps(id)).map((step) => step.state)).toEqual(['PENDING']);

      await h.closeLineForDeparture(id, e1.employeeId, note, h.it1).expect(200);

      expect(await h.state(id)).toBe('CANCELLED');
      expect((await h.needSteps(id)).map((step) => step.state)).toEqual(['CLOSED']);
    });
  });

  describe('the whole-request closing of the leaver who holds the last live line', () => {
    it('is the removal of that line, and refuses while more than one person is live', async () => {
      const { people, id } = await approved(2);
      const [e1] = people;
      await h.depart(e1);

      const many = await h.closeForDeparture(id, { cause: 'BENEFICIARY_LEFT' }, h.it1).expect(409);
      expect(h.codeOf(many)).toBe('ACCESS_REQUEST.GROUP_REQUEST_UNSUPPORTED');
      expect(await h.lineStates(id)).toEqual(['APPROVED', 'APPROVED']);

      await h.closeLineForDeparture(id, e1.employeeId, note, h.it1).expect(200);
      expect(await h.lineStates(id)).toEqual(['CANCELLED', 'APPROVED']);
    });

    it('cancels the request when the one live line is the leaver’s', async () => {
      const { u, people, id } = await approved(2);
      const [e1, e2] = people;
      await h.withdrawLine(id, e2.employeeId, {}, u.head.account).expect(200);
      await h.depart(e1);

      const closed = h.dataOf<{ request: RequestWire }>(
        await h.closeForDeparture(id, { cause: 'BENEFICIARY_LEFT', note: 'Gone' }, h.it1).expect(200),
      ).request;

      expect(closed.state).toBe('CANCELLED');
      expect(closed.cancellation).toMatchObject({ cause: 'BENEFICIARY_LEFT', note: 'Gone' });
      expect(await h.lineStates(id)).toEqual(['CANCELLED', 'WITHDRAWN']);
    });

    it('refuses the sole live person while they still work, whichever way it is asked', async () => {
      const { u, people, id } = await approved(2);
      const [e1, e2] = people;
      await h.withdrawLine(id, e2.employeeId, {}, u.head.account).expect(200);

      const whole = await h.closeForDeparture(id, { cause: 'BENEFICIARY_LEFT' }, h.it1).expect(409);
      const line = await h.closeLineForDeparture(id, e1.employeeId, note, h.it1).expect(409);

      expect(h.codeOf(whole)).toBe('ACCESS_REQUEST.BENEFICIARY_NOT_LEFT');
      expect(h.codeOf(line)).toBe('ACCESS_REQUEST.BENEFICIARY_NOT_LEFT');
      expect(await h.lineStates(id)).toEqual(['APPROVED', 'WITHDRAWN']);
    });
  });

  describe('what is refused', () => {
    it('refuses a person who still works, a line that ended, a withdrawal that waits for the IT Admin, and nobody’s line', async () => {
      const { u, people, id } = await approved(3);
      const [e1, e2, e3] = people;
      const stranger = await h.colleague(await unit());

      const working = await h.closeLineForDeparture(id, e1.employeeId, note, h.it1).expect(409);
      expect(h.codeOf(working)).toBe('ACCESS_REQUEST.BENEFICIARY_NOT_LEFT');

      await h.withdrawLine(id, e2.employeeId, {}, u.head.account).expect(200);
      await h.depart(e2);
      const ended = await h.closeLineForDeparture(id, e2.employeeId, note, h.it1).expect(409);
      expect(h.codeOf(ended)).toBe('ACCESS_REQUEST.ALREADY_ENDED');

      const task = await granted(id, e3.employeeId);
      await h.claim(task.id).expect(200);
      await h.fail(task.id, { reason: 'The vendor refused the invitation' }).expect(200);
      await h.withdrawLine(id, e3.employeeId, { reason: 'Not needed' }, u.head.account).expect(200);
      await h.depart(e3);
      const waiting = await h.closeLineForDeparture(id, e3.employeeId, note, h.it1).expect(409);
      expect(h.codeOf(waiting)).toBe('ACCESS_REQUEST.WITHDRAWAL_PENDING');

      await h.closeLineForDeparture(id, stranger.employeeId, note, h.it1).expect(404);
      expect(await h.lineStates(id)).toEqual(['APPROVED', 'WITHDRAWN', 'AWAITING_IT_CLOSE']);
    });

    it('is the work of the IT Admin alone', async () => {
      const { u, people, id } = await approved(2);
      await h.depart(people[0]);

      await h.closeLineForDeparture(id, people[0].employeeId, note, u.head.account).expect(403);
      await h.closeLineForDeparture(id, people[0].employeeId, note, people[1].account).expect(403);
      await h.closeLineForDeparture(id, people[0].employeeId, note, h.boss.account).expect(403);

      expect(await h.lineStates(id)).toEqual(['APPROVED', 'APPROVED']);
    });

    it('does not take the request of one person, and refuses what the body does not say', async () => {
      const { people, id } = await approved(2);
      await h.depart(people[0]);

      await h.closeLineForDeparture(id, people[0].employeeId, { cause: 'REQUESTER_WITHDREW' }, h.it1).expect(422);
      await h.closeLineForDeparture(id, people[0].employeeId, {}, h.it1).expect(422);
      await h.closeLineForDeparture(id, 'not-an-id', note, h.it1).expect(422);

      expect(await h.lineStates(id)).toEqual(['APPROVED', 'APPROVED']);
    });
  });

  describe('the list of what is open for the person who left', () => {
    it('says the request of a group is closable once the person has left, and stops listing it when their line is closed', async () => {
      const u = await unit();
      const [leaver, other] = await h.colleagues(u, 2);
      const id = await h.groupApproved(u, paid, [leaver, other]);
      const open = (person: Person) =>
        h.ctx.app.get(RequestsApi, { strict: false }).listOpenOfBeneficiary(person.employeeId, { skip: 0, take: 10 });

      expect((await open(leaver)).items[0]).toMatchObject({ requestId: id, group: true, cancellable: false });
      await h.depart(leaver);
      expect((await open(leaver)).items[0]).toMatchObject({ requestId: id, group: true, cancellable: true });

      await h.closeLineForDeparture(id, leaver.employeeId, note, h.it1).expect(200);

      expect((await open(leaver)).total).toBe(0);
      expect((await open(other)).total).toBe(1);
    });
  });

  describe('what each person is told', () => {
    it('tells the sender of the line that was removed, and nobody else of the group, nor the IT Admin, nor the person who left', async () => {
      const u = await unit();
      const [e1, e2, e3] = await h.colleagues(u, 3);
      const id = await h.groupApproved(u, paid, [e1, e2, e3]);
      await h.project();
      const before = await h.codesFor(e1.employeeId, id);
      await h.depart(e3);

      await h.closeLineForDeparture(id, e3.employeeId, note, h.it1).expect(200);
      await h.project();

      // The inbox does not tell a person who has left, so the person removed hears nothing and the sender is the one told.
      expect(await h.codesFor(e3.employeeId, id)).not.toContain('REQUEST_CANCELLED');
      expect((await h.codesFor(u.head.employeeId, id)).filter((code) => code === 'REQUEST_CANCELLED')).toEqual([
        'REQUEST_CANCELLED',
      ]);
      expect(await h.codesFor(e1.employeeId, id)).toEqual(before);
      expect(await h.codesFor(e2.employeeId, id)).not.toContain('REQUEST_CANCELLED');
      expect(await h.codesFor(h.it1.employeeId, id)).not.toContain('REQUEST_CANCELLED');
    });
  });

  describe('what the database keeps', () => {
    it('keeps the cause and the end of a cancelled line, and moves only the lines that may be cancelled', async () => {
      const { u, people, id } = await approved(3);
      const [e1, e2] = people;
      const other = await unit();
      const waiting = await h.groupWaiting(other, paid, await h.colleagues(other, 2));
      const task = await granted(id, e2.employeeId);
      await h.claim(task.id).expect(200);
      await h.fail(task.id, { reason: 'The vendor refused the invitation' }).expect(200);
      await h.withdrawLine(id, e2.employeeId, {}, u.head.account).expect(200);

      expect(
        await sqlState(
          `UPDATE access_request_lines SET state = 'CANCELLED', ended_at = now(), ended_by_employee_id = $2 WHERE request_id = $1 AND employee_id = $3`,
          [id, h.it1.employeeId, e1.employeeId],
        ),
      ).toBe(CHECK);
      expect(
        await sqlState(
          `UPDATE access_request_lines SET state = 'CANCELLED', ended_at = now(), cancel_cause = 'BENEFICIARY_LEFT' WHERE request_id = $1 AND employee_id = $2`,
          [id, e1.employeeId],
        ),
      ).toBe(CHECK);
      expect(
        await sqlState(
          `UPDATE access_request_lines SET state = 'APPROVED', cancel_cause = 'BENEFICIARY_LEFT' WHERE request_id = $1 AND employee_id = $2`,
          [id, e1.employeeId],
        ),
      ).toBe(CHECK);
      expect(
        await sqlState(
          `UPDATE access_request_lines SET state = 'CANCELLED', ended_at = now(), ended_by_employee_id = $2, cancel_cause = 'BENEFICIARY_LEFT' WHERE request_id = $1 AND employee_id = $3`,
          [id, h.it1.employeeId, e2.employeeId],
        ),
      ).toBe(FINAL);
      expect(
        await sqlState(
          `UPDATE access_request_lines SET state = 'CANCELLED', ended_at = now(), ended_by_employee_id = $2, cancel_cause = 'BENEFICIARY_LEFT' WHERE request_id = $1 AND employee_id = $3`,
          [waiting, h.it1.employeeId, (await h.lineRows(waiting))[0].employee_id],
        ),
      ).toBeNull();
      expect(
        await sqlState(`UPDATE access_request_lines SET state = 'APPROVED' WHERE request_id = $1`, [waiting]),
      ).toBe(FINAL);
    });
  });
});
