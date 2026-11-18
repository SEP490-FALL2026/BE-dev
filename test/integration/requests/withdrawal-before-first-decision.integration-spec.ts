import request from 'supertest';
import type { ApiAccount } from '../../support/api-accounts';
import { GroupHarness } from '../../support/group-harness';
import type { Person } from '../../support/request-harness';
import type { Unit } from '../../support/spend-harness';

const h = new GroupHarness();

interface RowWire {
  id: string;
  state: string;
  canWithdraw: boolean;
}

/**
 * The requester withdraws only before the first decision (`QĐ-113d`), over real HTTP and PostgreSQL, with no refusal lifted: a request
 * for a group, the head's own request that goes to the spending approver alone, new software that the IT Admin assesses first, and a
 * request for free software in a department with no head. Each is withdrawn before its first decider has decided and refused
 * (`WITHDRAWAL_AFTER_DECISION`) after, and the list says the same thing in `canWithdraw`.
 */
describe('the requester withdraws only before the first decision (integration, real PostgreSQL)', () => {
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

  const unit = async (): Promise<Unit> => {
    counter += 1;
    const made = await h.departmentWithHead(`P-WD${counter}`);
    await h.roomFor(made);

    return made;
  };
  /** What the list of my requests says of the request, for the account that sent it. */
  const canWithdrawIn = async (account: ApiAccount, id: string): Promise<boolean> => {
    const page = h.dataOf<{ items: RowWire[] }>(
      await request(h.server())
        .get('/api/v1/me/access-requests')
        .query({ pageSize: 100 })
        .set(h.as(account))
        .expect(200),
    );
    const row = page.items.find((item) => item.id === id);
    if (!row) throw new Error(`The request ${id} is not in the list.`);

    return row.canWithdraw;
  };

  describe('a request for a group', () => {
    it('withdraws a person, and all that is left, before any line was decided; the list agrees', async () => {
      const u = await unit();
      const people: Person[] = await h.colleagues(u, 3);
      const id = await h.groupWaiting(u, paid, people);
      expect(await canWithdrawIn(u.head.account, id)).toBe(true);

      await h.withdrawLine(id, people[2].employeeId, {}, u.head.account).expect(200);
      expect(await canWithdrawIn(u.head.account, id)).toBe(true);
      await h.withdrawRequest(id, {}, u.head.account).expect(200);

      expect(await h.state(id)).toBe('WITHDRAWN');
      expect(await canWithdrawIn(u.head.account, id)).toBe(false);
    });

    it('refuses a person and the whole request once the spending approver decided the lines, and the list agrees', async () => {
      const u = await unit();
      const people: Person[] = await h.colleagues(u, 3);
      const id = await h.groupApproved(u, paid, people);

      const line = await h.withdrawLine(id, people[0].employeeId, {}, u.head.account).expect(409);
      const whole = await h.withdrawRequest(id, {}, u.head.account).expect(409);

      expect(h.codeOf(line)).toBe('ACCESS_REQUEST.WITHDRAWAL_AFTER_DECISION');
      expect(h.detailsOf(line)).toEqual({ scope: 'LINE', state: 'APPROVED' });
      expect(h.codeOf(whole)).toBe('ACCESS_REQUEST.WITHDRAWAL_AFTER_DECISION');
      expect(h.detailsOf(whole)).toMatchObject({ scope: 'REQUEST' });
      expect(await h.lineStates(id)).toEqual(['APPROVED', 'APPROVED', 'APPROVED']);
      expect(await canWithdrawIn(u.head.account, id)).toBe(false);
    });
  });

  describe('the head’s own request, which only the spending approver decides', () => {
    it('is withdrawn before the approver decides, and refused after; the list agrees', async () => {
      const u = await unit();
      const before = await h.sent(u.head, paid, { termMonths: 1 });
      const after = await h.sent(u.head, paid, { termMonths: 1 });
      expect(before.state).toBe('AWAITING_SPEND_DECISION');
      expect(await canWithdrawIn(u.head.account, before.id)).toBe(true);

      await h.withdrawRequest(before.id, {}, u.head.account).expect(200);
      await h.decideSpend(after.id, { decision: 'APPROVE' }, h.boss.account).expect(200);
      const refused = await h.withdrawRequest(after.id, {}, u.head.account).expect(409);

      expect(await h.state(before.id)).toBe('WITHDRAWN');
      expect(h.codeOf(refused)).toBe('ACCESS_REQUEST.WITHDRAWAL_AFTER_DECISION');
      expect(await canWithdrawIn(u.head.account, after.id)).toBe(false);
    });
  });

  describe('new software that the IT Admin assesses first', () => {
    it('is withdrawn before the assessment is decided, and refused after; the list agrees', async () => {
      const u = await unit();
      await h.setItAdminInCharge(u.department, { employeeId: h.it1.employeeId, account: h.it1 });
      const before = await h.proposed(u.head);
      const after = await h.proposed(u.head);
      expect(before.state).toBe('AWAITING_IT_ASSESSMENT');
      expect(await canWithdrawIn(u.head.account, before.id)).toBe(true);
      await h.withdrawRequest(before.id, {}, u.head.account).expect(200);

      const quote = {
        unitPrice: { amount: '8000', currency: 'VND' },
        billingCycle: 'MONTHLY',
        validFrom: '2026-01-01',
        validUntil: null,
      };
      await h.saveAssessment(after.id, h.assessmentBody({ quote }), h.it1).expect(200);
      await h.completeAssessment(after.id, h.it1).expect(200);
      const refused = await h.withdrawRequest(after.id, {}, u.head.account).expect(409);

      expect(await h.state(before.id)).toBe('WITHDRAWN');
      expect(h.codeOf(refused)).toBe('ACCESS_REQUEST.WITHDRAWAL_AFTER_DECISION');
      expect(h.detailsOf(refused)).toMatchObject({ scope: 'REQUEST' });
      expect(await canWithdrawIn(u.head.account, after.id)).toBe(false);
    });
  });

  describe('free software in a department with no head, which goes straight to the IT Admin', () => {
    it('is withdrawn before its task is begun, and refused after; the list agrees', async () => {
      counter += 1;
      const department = await h.departmentWithUnit(`P-WDK${counter}`);
      const person = await h.staff(department, `WDK${counter}`);
      const k5 = await h.plan('K5');
      const before = await h.sent(person, k5);
      const after = await h.sent(person, k5);
      expect(before.state).toBe('AWAITING_EXECUTION');
      expect(await canWithdrawIn(person.account, before.id)).toBe(true);
      await h.withdrawRequest(before.id, {}, person.account).expect(200);

      const task = h.dataOf<{ task: { id: string } }>(await h.grant({ requestId: after.id }).expect(201)).task;
      await h.claim(task.id).expect(200);
      const refused = await h.withdrawRequest(after.id, {}, person.account).expect(409);

      expect(await h.state(before.id)).toBe('WITHDRAWN');
      expect(h.codeOf(refused)).toBe('ACCESS_REQUEST.WITHDRAWAL_AFTER_DECISION');
      expect(await canWithdrawIn(person.account, after.id)).toBe(false);
    });
  });
});
