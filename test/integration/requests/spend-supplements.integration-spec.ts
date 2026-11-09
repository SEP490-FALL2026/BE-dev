import type { Person } from '../../support/request-harness';
import { SpendHarness, Unit } from '../../support/spend-harness';

const h = new SpendHarness();
const M = 1_000_000;

interface SupplementWire {
  number: number;
  reason: string;
  changedBy: { employeeId: string };
  amount: { before: { amount: string }; after: { amount: string } };
  droppedCount: number;
}

/**
 * The supplementary file of the head (US-06-14 AC-13, AC-16): after QĐ-98 the only change the head makes to a request that waits in
 * their queue is to leave people of a request for a group out. The day the money goes out is no longer asked, so no file changes it.
 */
describe('the supplementary file of the head over PostgreSQL (US-06-14 AC-13, AC-16)', () => {
  let plan: string;
  let design: Unit;
  let counter = 0;

  beforeAll(async () => {
    await h.start();
    await h.withApprover();
    plan = await h.planOf(await h.subscription(10)); // 1 000 000 VND a seat a month
    await h
      .declareTaxProfile((await h.vendorOf(plan)).id, [{ taxType: 'GTGT', ratePercent: '10', deductible: true }])
      .expect(200);
    design = await h.departmentWithHead('P-DES');
    await h.budgetFor(design, { total: 1000 * M });
    await h.budgetFor(design, { total: 1000 * M, year: h.next });
  }, 240000);

  afterAll(async () => {
    await h.stop();
  });

  /** A request for a group of `count` people that waits in the queue of the head. */
  const queued = async (count = 3): Promise<{ id: string; people: Person[] }> => {
    const people: Person[] = [];
    for (let index = 0; index < count; index += 1) {
      counter += 1;
      people.push(await h.staff(design.department, `SUP-P${counter}`));
    }

    return { id: await h.sentForPeople(plan, people, design.head.account, { businessReason: 'The new team' }), people };
  };
  const supplement = (id: string, body: object, account = design.head.account) =>
    h.addSupplement(id, { reason: 'Left the team', ...body }, account);
  const history = async (id: string, account = design.head.account) =>
    h.dataOf<{ items: SupplementWire[] }>(await h.supplements(id, account).expect(200)).items;

  describe('leaving people out', () => {
    it('prices the request again for those who remain and keeps what it was before and after', async () => {
      const { id, people } = await queued(3);

      const response = await supplement(id, { dropEmployeeIds: [people[2].employeeId] }).expect(201);

      const file = h.dataOf<{ supplement: SupplementWire }>(response).supplement;
      expect(file).toMatchObject({
        number: 1,
        reason: 'Left the team',
        changedBy: { employeeId: design.head.employeeId },
        droppedCount: 1,
      });
      expect(Number(file.amount.after.amount)).toBeLessThan(Number(file.amount.before.amount));
      // The day the money goes out is not asked any more, so no file carries one.
      expect(file).not.toHaveProperty('expectedSpendOn');
      expect(await history(id)).toHaveLength(1);
    });

    it('keeps every supplementary file, the oldest first, and numbers them', async () => {
      const { id, people } = await queued(4);
      await supplement(id, { dropEmployeeIds: [people[3].employeeId] }).expect(201);
      await supplement(id, { dropEmployeeIds: [people[2].employeeId], reason: 'One more left' }).expect(201);

      const items = await history(id);

      expect(items.map((item) => [item.number, item.reason])).toEqual([
        [1, 'Left the team'],
        [2, 'One more left'],
      ]);
    });

    it('is not made for a request of one person, which has nobody to leave out', async () => {
      const sent = await h.sent(design.member, plan, { termMonths: 1 });
      await h.decide(sent.id, { decision: 'APPROVE' }, design.head.account).expect(200);

      const response = await supplement(sent.id, { dropEmployeeIds: [design.member.employeeId] }).expect(422);

      expect(h.codeOf(response)).toBe('SUPPLEMENT.DROP_NOT_FOR_GROUP');
      expect(await history(sent.id)).toEqual([]);
    });
  });

  describe('what it needs and who makes it', () => {
    it.each([
      ['no reason', { reason: undefined }],
      ['a blank reason', { reason: '   ' }],
      ['no person to leave out', { dropEmployeeIds: undefined }],
      ['a day of spending, which is not asked any more', { expectedSpendOn: '2026-11-15' }],
      ['a field that is not there', { amount: 5 }],
    ])('is not made with %s', async (_name, over) => {
      const { id, people } = await queued(3);

      const response = await supplement(id, { dropEmployeeIds: [people[2].employeeId], ...over }).expect(422);

      expect(h.codeOf(response)).toBe('VALIDATION_ERROR');
      expect(await history(id)).toEqual([]);
    });

    it('has no way to add a person, the spending approver or anybody: a field that names one is refused and the request stays as it was (US-06-14 AC-16, D-S23)', async () => {
      const { id, people } = await queued(3);
      const before = await h.requestRows();

      for (const over of [
        { addEmployeeIds: [h.boss.employeeId] },
        { beneficiaryEmployeeIds: [h.boss.employeeId] },
        { dropEmployeeIds: [people[2].employeeId], addEmployeeIds: [h.boss.employeeId] },
      ]) {
        const response = await supplement(id, over).expect(422);

        expect(h.codeOf(response)).toBe('VALIDATION_ERROR');
      }

      expect(await history(id)).toEqual([]);
      expect(await h.requestRows()).toBe(before);
      expect(
        (
          await h.ctx.sql.query(
            `SELECT 1 FROM access_request_beneficiaries WHERE request_id = $1 AND employee_id = $2`,
            [id, h.boss.employeeId],
          )
        ).rowCount,
      ).toBe(0);
    });

    it('is not made once the request is sent on: it is the head who changes a request in their queue only (US-05-04)', async () => {
      const { id, people } = await queued(3);
      await h.sendOn([id], design.head.account).expect(201);

      const response = await supplement(id, { dropEmployeeIds: [people[2].employeeId] }).expect(409);

      expect(h.codeOf(response)).toBe('SPEND.SUPPLEMENT_NOT_IN_QUEUE');
    });

    it('is only for the head of the department of the request', async () => {
      const { id, people } = await queued(3);
      const other = await h.departmentWithHead('P-OTH');
      const body = { dropEmployeeIds: [people[2].employeeId] };

      await supplement(id, body, other.head.account).expect(404);
      await supplement(id, body, design.member.account).expect(403);
      await supplement(id, body, h.finance).expect(403);
      await supplement(id, body, h.boss.account).expect(403); // the approver heads no department (QĐ-93b)
      expect(await history(id)).toEqual([]);
    });

    it('is read by the people who may read the request, and by nobody else', async () => {
      const { id, people } = await queued(3);
      await supplement(id, { dropEmployeeIds: [people[2].employeeId] }).expect(201);

      await h.supplements(id, design.head.account).expect(200);
      await h.supplements(id, h.finance).expect(404);
      await h.supplements(id, h.boss.account).expect(404);
    });
  });
});
