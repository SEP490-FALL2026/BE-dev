import { randomUUID } from 'node:crypto';
import { addDays } from '../../src/core/business-date';
import { FlowWorld } from '../support/flows/flow-world';

interface Adjustment {
  adjustmentPointOn: string;
  deadline: string;
  renewalOn: string;
  purchasedQuantity: number;
  seatsNeeded: { total: number; heldPastRenewal: number };
  target: number;
  activeSeatsToday: number;
  canCancel: boolean;
  recordedRenewalId: string | null;
}

/**
 * MF-5, the edges of F5-02 (SBF-20 §4.4, §8): what the IT Admin may record at the point of adjustment. The fields of one choice are refused on
 * another and `releasedAssignmentIds` is no longer taken (422, nothing written), the number must be the count of the system (409 with the
 * number to send again), a subscription in use cannot be cancelled, nobody records before the point, only the IT Admin records, and a seat granted
 * after the IT Admin read the number changes it — the write is refused with the new count, the IT Admin reads again and records once (`ALREADY_PROPOSED`
 * after that). Real sign-in, the seeded dataset, nothing mocked.
 *
 * Whose subscription it is: the shared pool (`QĐ-103d`). Figma Professional is the annual one (point opened, 18 bought, 14 in effect); Jira Standard is
 * by the month, whose point opens a week before its payment day. The clock of the flows starts on the real day and the payment day of a plan by the month
 * is the nearest of the grid of its stored day, so where Jira stands against its point changes with the calendar: the case that needs it before its point
 * puts the payment day of Jira 20 days from today first (R-2).
 */
describe('MF-5 ghi kết quả điều chỉnh: các biên của F5-02 @MF5 @D1', () => {
  let world: FlowWorld;
  let figma: string;
  let jira: string;

  const call = () => world.calls;
  const adjustmentOf = async (subscriptionId: string, code = 'NV-ITA1'): Promise<Adjustment> =>
    call().data<{ adjustment: Adjustment }>(
      await call().get(code, `/subscription-renewals/adjustment?subscriptionId=${subscriptionId}`),
    ).adjustment;
  const record = (body: Record<string, unknown>, code = 'NV-ITA1') =>
    call().post(code, '/subscription-renewals', { subscriptionId: figma, outcome: 'AS_DECIDED', ...body });
  /** The year the vendor confirmed, starting on the renewal day (A1C-03, A1C-04). */
  const nextYear = (renewalOn: string, quantity: number) => ({
    purchasedQuantity: quantity,
    unitPrice: { amount: '4500000', currency: 'VND' },
    billingCycle: 'ANNUAL',
    startDate: renewalOn,
    endDate: addDays(renewalOn, 364),
    renewalDate: addDays(renewalOn, 365),
    noticePeriodDays: 30,
    autoRenew: true,
    allowsMidTermReduction: false,
  });
  const cases = () => world.facts.count('subscription_renewals');

  beforeAll(async () => {
    world = await FlowWorld.open();
    figma = await call().subscriptionOf('Figma Professional');
    jira = await call().subscriptionOf('Jira Standard');
  }, 300000);

  afterAll(async () => {
    await world?.close();
  });

  describe('hình dạng lựa chọn @B5', () => {
    it('trường của lựa chọn khác bị từ chối: số lượng với hủy, thiếu số với giảm/tăng, vượt mức mua, giữ nguyên khác số đã mua ⟹ 422 và không ghi gì #9', async () => {
      const bought = (await adjustmentOf(figma)).purchasedQuantity;
      const written = await cases();

      const cancelWithQuantity = await record({
        choice: 'CANCEL',
        proposedQuantity: 0,
        outcome: 'AS_DECIDED',
        closure: { dataExported: true, adminsTransferred: true },
      });
      const reduceWithoutQuantity = await record({ choice: 'REDUCE' });
      const reduceAboveBought = await record({ choice: 'REDUCE', proposedQuantity: bought });
      const increaseBelowBought = await record({ choice: 'INCREASE', proposedQuantity: bought });
      const renewWithOther = await record({ choice: 'RENEW', proposedQuantity: bought - 1 });

      for (const response of [cancelWithQuantity, increaseBelowBought, reduceAboveBought, renewWithOther]) {
        expect([response.status, call().codeOf(response)]).toEqual([422, 'SUBSCRIPTION_RENEWAL.QUANTITY_INVALID']);
      }
      expect([reduceWithoutQuantity.status, call().codeOf(reduceWithoutQuantity)]).toEqual([
        422,
        'SUBSCRIPTION_RENEWAL.QUANTITY_INVALID',
      ]);
      expect(await cases()).toBe(written);
    });

    it('body cũ bị 422: danh sách ghế thu hồi không còn được nhận; thiếu ghi chú khi NCC từ chối; closure kèm lựa chọn khác hủy #9', async () => {
      const written = await cases();

      for (const body of [
        { choice: 'REDUCE', proposedQuantity: 1, releasedAssignmentIds: [randomUUID()] },
        { choice: 'REDUCE', proposedQuantity: 1, outcome: 'VENDOR_REFUSED' },
        { choice: 'RENEW', closure: { dataExported: true, adminsTransferred: true } },
        { choice: 'CANCEL', outcome: 'AS_DECIDED' },
        { choice: 'CANCEL', outcome: 'AS_DECIDED', closure: { dataExported: true, adminsTransferred: false } },
      ]) {
        const response = await record(body);
        expect([JSON.stringify(body), response.status, call().codeOf(response)]).toEqual([
          JSON.stringify(body),
          422,
          'VALIDATION_ERROR',
        ]);
      }
      expect(await cases()).toBe(written);
    });
  });

  describe('số seat do hệ thống tính và hủy thuê bao còn người dùng @B5', () => {
    it('số ghi khác số hệ thống tính ⟹ 409 kèm số đúng để gửi lại, không ghi gì #9', async () => {
      const seen = await adjustmentOf(figma);
      const written = await cases();

      const wrong = await record({ choice: 'REDUCE', proposedQuantity: seen.target + 3 });

      expect([wrong.status, call().codeOf(wrong)]).toEqual([409, 'SUBSCRIPTION_RENEWAL.QUANTITY_NOT_SEATS_NEEDED']);
      expect(call().detailsOf(wrong)).toMatchObject({
        seatsNeeded: seen.seatsNeeded.total,
        target: seen.target,
        quantity: seen.target + 3,
      });
      expect(await cases()).toBe(written);
    });

    it('hủy thuê bao còn người dùng ⟹ 409 CANCEL_NOT_ALLOWED kèm số ghế còn hiệu lực; Finance chỉ đọc số, không ghi #9', async () => {
      const seen = await adjustmentOf(figma);
      expect(seen).toMatchObject({ canCancel: false, recordedRenewalId: null });
      const written = await cases();

      const cancel = await record({
        choice: 'CANCEL',
        outcome: 'AS_DECIDED',
        closure: { dataExported: true, adminsTransferred: true },
      });

      expect([cancel.status, call().codeOf(cancel)]).toEqual([409, 'SUBSCRIPTION_RENEWAL.CANCEL_NOT_ALLOWED']);
      expect(call().detailsOf(cancel)).toMatchObject({
        seatsNeeded: seen.seatsNeeded.total,
        heldPastRenewal: seen.seatsNeeded.heldPastRenewal,
        activeSeatsToday: seen.activeSeatsToday,
        openRequests: 0,
      });
      expect(await cases()).toBe(written);
      expect((await adjustmentOf(figma, 'NV-FIN1')).canCancel).toBe(false);
    });
  });

  describe('ai ghi và khi nào @B5', () => {
    it('chỉ IT Admin ghi: trưởng phòng, Người duyệt chi, Finance, nhân viên bị 403; thuê bao không tồn tại 404 #9', async () => {
      const written = await cases();

      for (const code of ['NV-DESH', 'NV-CEO', 'NV-FIN1', 'NV-DES1', 'NV-SA']) {
        const refused = await record({ choice: 'RENEW' }, code);
        expect([code, refused.status]).toEqual([code, 403]);
      }
      const unknown = await call().post('NV-ITA1', '/subscription-renewals', {
        subscriptionId: randomUUID(),
        choice: 'RENEW',
        outcome: 'AS_DECIDED',
      });
      expect([unknown.status, call().codeOf(unknown)]).toEqual([404, 'SUBSCRIPTION_RENEWAL.NOT_FOUND']);
      expect(await cases()).toBe(written);
    });

    it('trước điểm điều chỉnh ⟹ 409 BEFORE_ADJUSTMENT_POINT kèm ngày mở; số vẫn đọc được từ mọi ngày #9', async () => {
      // The payment day of Jira follows today, not the calendar of the dataset: 20 days from today, so its point (7 days before) is 13 days away.
      const paymentDay = call().inDays(20);
      await world.ctx.sql.query(`UPDATE subscriptions SET renewal_date = $2::date, end_date = NULL WHERE id = $1`, [
        jira,
        paymentDay,
      ]);
      const seen = await adjustmentOf(jira);
      expect(seen.deadline).toBe(paymentDay);
      expect(seen.adjustmentPointOn).toBe(addDays(paymentDay, -7));
      expect(seen.adjustmentPointOn > call().today()).toBe(true);
      const written = await cases();

      const early = await call().post('NV-ITA1', '/subscription-renewals', {
        subscriptionId: jira,
        choice: 'REDUCE',
        proposedQuantity: seen.target,
        outcome: 'AS_DECIDED',
      });

      expect([early.status, call().codeOf(early)]).toEqual([409, 'SUBSCRIPTION_RENEWAL.BEFORE_ADJUSTMENT_POINT']);
      expect(call().detailsOf(early)).toEqual({
        adjustmentPointOn: seen.adjustmentPointOn,
        deadline: seen.deadline,
      });
      expect(await cases()).toBe(written);
    });
  });

  describe('số cần đổi giữa lúc xem và lúc ghi (QĐ-104d) @B5', () => {
    it('một ghế nữa được cấp sau khi IT đọc số: ghi số cũ ⟹ 409 kèm số mới, IT đọc lại và ghi được một lần, ghi lần hai ⟹ NOT_RENEWABLE (kỳ đã nối tiếp) #9', async () => {
      const first = await adjustmentOf(figma);
      // A person of the department gets a seat with no end after the IT Admin read the number: the seat is needed after the renewal.
      await world.ctx.sql.query(
        `INSERT INTO license_assignments (id, organization_id, kind, source, plan_id, subscription_id, employee_id, account_identifier,
           normalized_account_identifier, valid_from, valid_from_basis, owning_department_id, created_by_app_user_id)
         SELECT gen_random_uuid(), s.organization_id, 'PERSONAL', 'REQUEST', s.plan_id, s.id, e.id, e.work_email, e.normalized_work_email,
                $3::date, 'RECORDED', (SELECT id FROM departments WHERE code = 'ENG'), $4::uuid
           FROM subscriptions s JOIN employees e ON e.employee_code = $2 WHERE s.id = $1`,
        [figma, 'NV-DEV3', call().today(), randomUUID()],
      );

      const stale = await record({ choice: 'REDUCE', proposedQuantity: first.target });

      expect([stale.status, call().codeOf(stale)]).toEqual([409, 'SUBSCRIPTION_RENEWAL.QUANTITY_NOT_SEATS_NEEDED']);
      expect(call().detailsOf(stale)).toMatchObject({
        seatsNeeded: first.seatsNeeded.total + 1,
        target: first.target + 1,
        quantity: first.target,
      });
      const second = await adjustmentOf(figma);
      expect(second.target).toBe(first.target + 1);

      // The seats the dataset already decided to take back stay held until their revocation completes (not before the day the task names), and the
      // new period buys the seats the system counts: the IT Admin completes them first, as the flow of the adjustment does.
      const tasks = await world.facts.rows<{ id: string }>(
        `SELECT t.id FROM provisioning_tasks t JOIN license_assignments a ON a.id = t.assignment_id
          WHERE t.kind = 'REVOKE' AND a.subscription_id = $1 AND t.status = 'QUEUED'`,
        [figma],
      );
      world.clock.jumpDays(7);
      await world.actors.signIn('NV-ITA1');
      for (const task of tasks) {
        expect((await call().post('NV-ITA1', `/provisioning-tasks/${task.id}/claim`)).status).toBe(200);
        const done = await call().post('NV-ITA1', `/provisioning-tasks/${task.id}/revocation-completion`, {
          completion: 'ACCOUNT_REMOVED',
          evidence: 'đã gỡ tài khoản Figma',
        });
        expect(done.status).toBe(200);
      }
      const third = await adjustmentOf(figma);
      expect(third.target).toBe(second.target);

      const written = await cases();
      const recorded = await record({
        choice: 'REDUCE',
        proposedQuantity: third.target,
        nextPeriod: nextYear(third.renewalOn, third.target),
      });
      expect(recorded.status).toBe(201);
      expect(await cases()).toBe(written + 1);
      // The period has its successor: no number is read for it any more and a second write is refused.
      const read = await call().get('NV-ITA1', `/subscription-renewals/adjustment?subscriptionId=${figma}`);
      expect([read.status, call().codeOf(read)]).toEqual([409, 'SUBSCRIPTION_RENEWAL.NOT_RENEWABLE']);

      const twice = await record({
        choice: 'REDUCE',
        proposedQuantity: third.target,
        nextPeriod: nextYear(third.renewalOn, third.target),
      });
      expect([twice.status, call().codeOf(twice), call().detailsOf(twice)]).toEqual([
        409,
        'SUBSCRIPTION_RENEWAL.NOT_RENEWABLE',
        { reason: 'ALREADY_CONTINUED' },
      ]);
      expect(await cases()).toBe(written + 1);
    });
  });
});
