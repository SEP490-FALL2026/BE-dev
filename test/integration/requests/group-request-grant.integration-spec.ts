import { createActivatedAccount, type ApiAccount } from '../../support/api-accounts';
import { GroupHarness } from '../../support/group-harness';
import type { Unit } from '../../support/spend-harness';

const h = new GroupHarness();

interface TaskWire {
  id: string;
  status: string;
}
interface QueueItem {
  requestId: string;
  type: string;
  lineCount: number;
  beneficiary: { employeeId: string };
}

describe('the grant of the people of a request for a group, one person at a time, over PostgreSQL (US-05-17 AC-6, AC-7)', () => {
  let subscriptionId: string;
  let paid: string;
  let counter = 0;
  let second: ApiAccount;

  beforeAll(async () => {
    await h.start();
    await h.withApprover();
    subscriptionId = await h.subscription(100);
    paid = await h.planOf(subscriptionId);
    second = await createActivatedAccount(h.ctx, h.seed, {
      code: 'E-IT2',
      email: 'it2@acme.vn',
      role: 'IT_ADMIN',
      admin: h.admin,
    });
  }, 240000);

  afterAll(async () => {
    await h.stop();
  });

  const unit = async (): Promise<Unit> => {
    counter += 1;
    const made = await h.departmentWithHead(`P-R${counter}`);
    await h.roomFor(made);

    return made;
  };
  /** A group of the head's department, every person approved as spend. */
  const approved = async (count = 3) => {
    const u = await unit();
    const people = await h.colleagues(u, count);

    return { u, people, id: await h.groupApproved(u, paid, people) };
  };
  const grant = (id: string, employeeId: string, account: ApiAccount = h.it1) =>
    h.grantLine({ requestId: id, beneficiaryEmployeeId: employeeId, subscriptionId }, account);
  const granted = async (id: string, employeeId: string, account: ApiAccount = h.it1) =>
    h.dataOf<{ task: TaskWire }>(await grant(id, employeeId, account).expect(201)).task;
  const done = async (taskId: string) => {
    await h.claim(taskId).expect(200);
    await h.complete(taskId, { evidence: 'Invited by work email' }).expect(200);
  };
  const releases = async (id: string) =>
    (
      await h.ctx.sql.query<{ reason: string; amount_minor: string }>(
        `SELECT r.reason::text, r.amount_minor::text FROM budget_commitment_releases r
           JOIN budget_commitments c ON c.id = r.commitment_id WHERE c.request_id = $1 ORDER BY r.amount_minor, r.id`,
        [id],
      )
    ).rows;
  const assignments = async (id: string) =>
    (
      await h.ctx.sql.query<{ employee_id: string; kind: string; account_identifier: string; failed_at: Date | null }>(
        `SELECT a.employee_id, a.kind::text, a.account_identifier, a.failed_at FROM license_assignments a
           JOIN provisioning_tasks t ON t.assignment_id = a.id WHERE t.request_id = $1 ORDER BY a.employee_id`,
        [id],
      )
    ).rows;

  describe('what may be granted (AC-6)', () => {
    it('asks which person the grant is for, and grants only a person whose line is approved', async () => {
      const u = await unit();
      const people = await h.colleagues(u, 2);
      const waitingId = await h.groupWaiting(u, paid, people);
      const { id, people: others } = await approved(2);

      const nobody = await h.grantLine({ requestId: id, subscriptionId }, h.it1).expect(422);
      const early = await grant(waitingId, people[0].employeeId).expect(409);
      const stranger = await grant(id, people[0].employeeId).expect(404);

      expect(h.codeOf(nobody)).toBe('PROVISIONING.BENEFICIARY_REQUIRED');
      expect(h.codeOf(early)).toBe('PROVISIONING.REQUEST_NOT_APPROVED');
      expect(h.codeOf(stranger)).toBe('REQUEST.NOT_FOUND');
      expect(await h.lineStates(id)).toEqual(['APPROVED', 'APPROVED']);
      expect(others).toHaveLength(2);
    });

    it('lists one row for each approved person, with the size of the group, until each is granted', async () => {
      const { people, id } = await approved(3);

      const before = h
        .dataOf<{ items: QueueItem[] }>(await h.grantQueue(h.it1, { pageSize: 100 }).expect(200))
        .items.filter((item) => item.requestId === id);
      await granted(id, people[1].employeeId);
      const after = h
        .dataOf<{ items: QueueItem[] }>(await h.grantQueue(h.it1, { pageSize: 100 }).expect(200))
        .items.filter((item) => item.requestId === id);

      expect(before.map((item) => [item.beneficiary.employeeId, item.type, item.lineCount])).toEqual(
        people.map((person) => [person.employeeId, 'GROUP_GRANT', 3]).sort(),
      );
      expect(after.map((item) => item.beneficiary.employeeId)).toEqual(
        [people[0].employeeId, people[2].employeeId].sort(),
      );
    });
  });

  describe('every person has a seat of their own (AC-7)', () => {
    it('makes one assignment and one task for each person, on that person’s own company account, and completes the request when the last is done', async () => {
      const { people, id } = await approved(3);

      const tasks: TaskWire[] = [];
      for (const person of people) tasks.push(await granted(id, person.employeeId));
      expect(await h.state(id)).toBe('EXECUTING');
      expect(await h.lineStates(id)).toEqual(['EXECUTING', 'EXECUTING', 'EXECUTING']);

      const seats = await assignments(id);
      expect(seats).toHaveLength(3);
      expect(new Set(seats.map((seat) => seat.account_identifier)).size).toBe(3);
      expect(seats.every((seat) => seat.kind === 'PERSONAL')).toBe(true);

      await done(tasks[0].id);
      expect(await h.state(id)).toBe('EXECUTING');
      await done(tasks[1].id);
      await done(tasks[2].id);
      expect(await h.state(id)).toBe('COMPLETED');
      expect(await h.lineStates(id)).toEqual(['COMPLETED', 'COMPLETED', 'COMPLETED']);
      expect(
        await h.ctx.sql
          .query(`SELECT grant_completed_at FROM access_requests WHERE id = $1 AND grant_completed_at IS NOT NULL`, [
            id,
          ])
          .then((r) => r.rowCount),
      ).toBe(1);
    });

    it('lets two IT Admins grant two people at once, and neither waits for the other to finish the group', async () => {
      const { people, id } = await approved(2);

      const [first, other] = await Promise.all([
        grant(id, people[0].employeeId, h.it1),
        grant(id, people[1].employeeId, second),
      ]);

      expect([first.status, other.status]).toEqual([201, 201]);
      expect(await h.lineStates(id)).toEqual(['EXECUTING', 'EXECUTING']);
      expect(await h.state(id)).toBe('EXECUTING');
    });

    it('grants one person once: a second grant of the same line finds it carried out', async () => {
      const { people, id } = await approved(2);
      await granted(id, people[0].employeeId);

      const again = await grant(id, people[0].employeeId).expect(409);

      expect(h.codeOf(again)).toBe('PROVISIONING.REQUEST_ENDED');
    });
  });

  describe('a grant that fails for one person fails that line alone (AC-6)', () => {
    it('gives back the share of that person only, and the others are granted and completed as usual', async () => {
      const { people, id } = await approved(3);
      const [e1, e2, e3] = people;
      const t1 = await granted(id, e1.employeeId);
      const t2 = await granted(id, e2.employeeId);
      const t3 = await granted(id, e3.employeeId);
      const share = (await h.shares(id)).filter((row) => row.employee_id === e2.employeeId);

      await h.claim(t2.id).expect(200);
      await h.fail(t2.id, { reason: 'The vendor refused the invitation' }).expect(200);
      await h.closeFailed(t2.id, { reason: 'Given up' }).expect(200);
      await done(t1.id);
      await done(t3.id);

      expect(await h.lineStates(id)).toEqual(['COMPLETED', 'FAILED', 'COMPLETED']);
      expect(await h.state(id)).toBe('COMPLETED');
      // M-10 (G9-02): the K2 seats granted give back their days before the grant (LATE_GRANT); the failed line gives back its share.
      const all = await releases(id);
      expect(all.every((row) => row.reason === 'GRANT_FAILED' || row.reason === 'LATE_GRANT')).toBe(true);
      const released = all.filter((row) => row.reason === 'GRANT_FAILED');
      expect(released.map((row) => BigInt(row.amount_minor)).reduce((sum, value) => sum + value, 0n)).toBe(
        share.map((row) => BigInt(row.amount_minor)).reduce((sum, value) => sum + value, 0n),
      );
      const seats = await assignments(id);
      expect(seats.find((seat) => seat.employee_id === e2.employeeId)?.failed_at).not.toBeNull();
      expect(seats.filter((seat) => seat.failed_at === null)).toHaveLength(2);
      const shares = await h.shares(id);
      expect(shares.filter((row) => row.released_at !== null).every((row) => row.employee_id === e2.employeeId)).toBe(
        true,
      );
    });

    it('ends the request as failed when nobody was granted, and gives everything back', async () => {
      const { people, id } = await approved(2);
      for (const person of people) {
        const task = await granted(id, person.employeeId);
        await h.claim(task.id).expect(200);
        await h.fail(task.id, { reason: 'Not done' }).expect(200);
        await h.closeFailed(task.id, { reason: 'Given up' }).expect(200);
      }

      expect(await h.state(id)).toBe('FAILED');
      expect(await h.lineStates(id)).toEqual(['FAILED', 'FAILED']);
      const shares = await h.shares(id);
      expect(shares.every((row) => row.released_at !== null)).toBe(true);
    });
  });
});
