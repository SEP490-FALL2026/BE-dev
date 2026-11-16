import request from 'supertest';
import { addDays, type BusinessDate } from '../../../src/core/business-date';
import { nthWorkingDayFrom } from '../../../src/core/working-days';
import { BudgetReviewExplanationReminderService } from '../../../src/modules/budgets/review/budget-review-explanation-reminder.service';
import { OperatingParametersApi } from '../../../src/modules/operating-parameters/public/operating-parameters.api';
import { InvoiceHarness } from '../../support/invoice-harness';
import { pretendBusinessToday } from '../../support/pretend-today';
import type { Unit } from '../../support/spend-harness';

const h = new InvoiceHarness();
const M = 1_000_000;

interface LineWire {
  costCenter: { id: string } | null;
  light: string;
  explanationStatus: string;
  explanation: {
    cause: string;
    persistence: string;
    action: string;
    knownNeedsToYearEnd: { amount: { amount: string } | null; note: string };
  } | null;
}
interface PeriodWire {
  id: string;
  kind: string;
  state: string;
  explanationsDueOn: string | null;
}
interface DetailWire {
  period: PeriodWire;
  items: LineWire[];
}

/**
 * The explanations of a quarterly review (`RV-3`, `QĐ-111ah`, R-10, R-17, B-7): the quarter opens waiting for the explanations of its yellow, red and under Cost Centers, with the
 * fifth working day as the due day; only the head of the department of the Cost Center explains, and only a line that was asked; the head is reminded on the due day and every
 * Monday after it, once each day; Finance signs whenever it wants and what nobody answered is UNEXPLAINED, or NO_HEAD when the department had no head; a signed quarter takes no
 * explanation, and the database refuses to move an explanation of a period that does not wait for it.
 */
describe('the heads of departments explain a quarterly review and Finance signs it (integration; RV-3)', () => {
  let answering: Unit;
  let green: Unit;
  let headless: Unit;
  let silent: Unit;
  let other: Unit;
  let vendorId: string;
  let today: BusinessDate;
  let quarter: PeriodWire;
  const costCenterOf = (unit: Unit): string => unit.department.unitId;
  const explaining = (
    unit: Unit,
    asHeadOf: Unit = unit,
    body: Record<string, unknown> = {},
    periodId: string = quarter.id,
  ) =>
    request(h.server())
      .put(`/api/v1/budget-review-periods/${periodId}/lines/${costCenterOf(unit)}/explanation`)
      .set(h.as(asHeadOf.head.account))
      .send({
        cause: 'Licences bought early for the new team',
        persistence: 'ONE_OFF',
        action: 'No further purchase this quarter',
        knownNeedsToYearEnd: { amount: h.money(5 * M), note: 'Two more seats in the autumn' },
        ...body,
      });
  const detail = async (periodId: string = quarter.id): Promise<DetailWire> =>
    h.dataOf<DetailWire>(
      await request(h.server())
        .get(`/api/v1/budget-review-periods/${periodId}`)
        .query({ pageSize: 100 })
        .set(h.as(h.finance))
        .expect(200),
    );
  const lineOf = async (unit: Unit, periodId?: string): Promise<LineWire> =>
    (await detail(periodId)).items.find((line) => line.costCenter?.id === costCenterOf(unit)) as LineWire;
  const reminder = () => h.ctx.app.get(BudgetReviewExplanationReminderService, { strict: false });
  const noticesTo = async (unit: Unit): Promise<string[]> =>
    (
      await h.ctx.sql.query<{ event_key: string }>(
        `SELECT event_key FROM in_app_notifications
          WHERE code = 'BUDGET_REVIEW_EXPLANATION_DUE' AND recipient_employee_id = $1 ORDER BY event_key`,
        [unit.head.employeeId],
      )
    ).rows.map((row) => row.event_key);
  /** A department with a budget of 100 tr, and an invoice of `spentTr` for February: yellow at the close of March (the pace is far over 110 percent). */
  const department = async (code: string, spentTr: number): Promise<Unit> => {
    const unit = await h.departmentWithHead(code);
    await h.ctx.sql.query(`UPDATE budget_cycles SET annual_ceiling_minor = 1000000000000 WHERE year = $1`, [h.year]);
    await h.budgetFor(unit, { total: 100 * M });
    if (spentTr > 0) {
      await h.recordPurchase(vendorId, {
        chargedCostCenterId: costCenterOf(unit),
        netMinor: BigInt(spentTr * M),
        issuedOn: `${h.year}-02-10`,
        serviceMonth: `${h.year}-02-01`,
      });
    }

    return unit;
  };

  beforeAll(async () => {
    await h.start();
    await h.withApprover();
    vendorId = (await h.vendorOf(await h.planOf(await h.subscription(10)))).id;
    answering = await department('P-RV3A', 90);
    green = await department('P-RV3G', 0);
    headless = await department('P-RV3N', 90);
    silent = await department('P-RV3S', 90);
    other = await department('P-RV3O', 0);
    // After the year: every month of it has ended, and the heads named today are heads on that day.
    today = `${h.year + 1}-01-10`;
    pretendBusinessToday(h.ctx.app, today);
    quarter = h.dataOf<PeriodWire>(
      await request(h.server())
        .post('/api/v1/budget-review-periods')
        .set(h.as(h.finance))
        .send({ year: h.year, month: 3 })
        .expect(201),
    );
  }, 300000);

  afterAll(async () => {
    jest.restoreAllMocks();
    await h.stop();
  });

  it('the quarter opens waiting for explanations, due on the fifth working day from the close, and asks only the yellow, red and under Cost Centers', async () => {
    const nonWorking = await h.ctx.app
      .get(OperatingParametersApi, { strict: false })
      .getNonWorkingDates(today, addDays(today, 30));
    const read = await detail();

    expect(quarter).toMatchObject({ kind: 'QUARTER', state: 'AWAITING_EXPLANATIONS' });
    expect(read.period.explanationsDueOn).toBe(nthWorkingDayFrom(today, 5, nonWorking));
    expect(await lineOf(answering)).toMatchObject({ light: 'YELLOW', explanationStatus: 'PENDING', explanation: null });
    expect(await lineOf(green)).toMatchObject({ light: 'GREEN', explanationStatus: 'NOT_REQUIRED' });
  }, 120000);

  it('only the head of the department of the Cost Center explains: the head of another department and Finance get 403', async () => {
    const other403 = await explaining(answering, other).expect(403);
    expect((other403.body as { error: { code: string } }).error.code).toBe('BUDGET.NOT_YOUR_COST_CENTER');
    await request(h.server())
      .put(`/api/v1/budget-review-periods/${quarter.id}/lines/${costCenterOf(answering)}/explanation`)
      .set(h.as(h.finance))
      .send({ cause: 'x', persistence: 'ONE_OFF', action: 'y', knownNeedsToYearEnd: { note: 'z' } })
      .expect(403);
    expect((await lineOf(answering)).explanationStatus).toBe('PENDING');
  }, 120000);

  it('the head explains a line that was asked, and may write it again until Finance signs; a green line takes none', async () => {
    const done = h.dataOf<{ explanationStatus: string; explanation: LineWire['explanation'] }>(
      await explaining(answering).expect(200),
    );
    expect(done.explanationStatus).toBe('EXPLAINED');
    expect(done.explanation).toMatchObject({
      cause: 'Licences bought early for the new team',
      persistence: 'ONE_OFF',
      knownNeedsToYearEnd: { amount: { amount: String(5 * M) }, note: 'Two more seats in the autumn' },
    });
    await explaining(answering, answering, {
      persistence: 'ONGOING',
      knownNeedsToYearEnd: { note: 'Nothing known yet' },
    }).expect(200);
    expect(await lineOf(answering)).toMatchObject({
      explanationStatus: 'EXPLAINED',
      explanation: { persistence: 'ONGOING', knownNeedsToYearEnd: { amount: null, note: 'Nothing known yet' } },
    });
    const notAsked = await explaining(green).expect(422);
    expect((notAsked.body as { error: { code: string } }).error.code).toBe('BUDGET_REVIEW.EXPLANATION_NOT_REQUIRED');
    await explaining(answering, answering, { cause: '' }).expect(422);
  }, 120000);

  it('B-7: the head who has not explained is reminded on the due day and then every Monday, once each day, and nobody before the due day', async () => {
    // The head of one department is gone: nobody is reminded for it.
    await h.ctx.sql.query(
      `UPDATE department_head_periods SET valid_to = $2::date WHERE department_id = $1 AND valid_to IS NULL`,
      [headless.department.id, `${h.year}-12-31`],
    );
    const dueOn = (await detail()).period.explanationsDueOn as BusinessDate;
    let monday = addDays(dueOn, 1);
    while (new Date(`${monday}T00:00:00Z`).getUTCDay() !== 1) monday = addDays(monday, 1);
    const key = (day: string) => `review:${quarter.id}:${costCenterOf(silent)}:${day}`;

    expect(await reminder().remind(addDays(dueOn, -1))).toBe(0);
    expect(await reminder().remind(dueOn)).toBe(1);
    expect(await reminder().remind(dueOn)).toBe(0);
    expect(await reminder().remind(addDays(dueOn, 1) === monday ? addDays(dueOn, 2) : addDays(dueOn, 1))).toBe(0);
    expect(await reminder().remind(monday)).toBe(1);
    expect(await noticesTo(silent)).toEqual([key(dueOn), key(monday)].sort());
    // The head who explained is never reminded, and a department with no head has nobody to remind.
    expect(await noticesTo(answering)).toEqual([]);
  }, 120000);

  it('R-10, R-17: Finance signs with a department that did not answer, and the line says UNEXPLAINED, or NO_HEAD when its department had no head; a signed quarter takes nothing', async () => {
    await request(h.server())
      .post(`/api/v1/budget-review-periods/${quarter.id}/signature`)
      .set(h.as(h.finance))
      .send({})
      .expect(200);
    const signed = await detail();

    expect(signed.period.state).toBe('SIGNED');
    expect(await lineOf(answering)).toMatchObject({ explanationStatus: 'EXPLAINED' });
    expect(await lineOf(green)).toMatchObject({ explanationStatus: 'NOT_REQUIRED' });
    expect(await lineOf(silent)).toMatchObject({ explanationStatus: 'UNEXPLAINED' });
    expect(await lineOf(headless)).toMatchObject({ explanationStatus: 'NO_HEAD' });
    const late = await explaining(silent).expect(409);
    expect((late.body as { error: { code: string } }).error.code).toBe('BUDGET_REVIEW.NOT_AWAITING_EXPLANATIONS');
    expect(await reminder().remind(addDays(signed.period.explanationsDueOn as BusinessDate, 7))).toBe(0);
  }, 120000);

  it('a month has no explanations, and the database refuses to move an explanation of a period that does not wait for one', async () => {
    const month = h.dataOf<PeriodWire>(
      await request(h.server())
        .post('/api/v1/budget-review-periods')
        .set(h.as(h.finance))
        .send({ year: h.year, month: 4 })
        .expect(201),
    );
    expect(month).toMatchObject({ kind: 'MONTH', state: 'SNAPSHOT', explanationsDueOn: null });
    expect((await lineOf(silent, month.id)).explanationStatus).toBe('NOT_REQUIRED');
    expect(
      ((await explaining(silent, silent, {}, month.id).expect(409)).body as { error: { code: string } }).error.code,
    ).toBe('BUDGET_REVIEW.NOT_AWAITING_EXPLANATIONS');
    await expect(
      h.ctx.sql.query(
        `UPDATE budget_review_lines SET explanation_status = 'PENDING' WHERE period_id = $1 AND cost_center_id = $2`,
        [month.id, costCenterOf(silent)],
      ),
    ).rejects.toThrow(/waits for explanations/);
    await expect(
      h.ctx.sql.query(
        `UPDATE budget_review_lines SET explanation_cause = 'late' WHERE period_id = $1 AND cost_center_id = $2`,
        [quarter.id, costCenterOf(answering)],
      ),
    ).rejects.toThrow(/waits for explanations/);
    // The figures of the picture still never move.
    await expect(
      h.ctx.sql.query(`UPDATE budget_review_lines SET spent_minor = 0 WHERE period_id = $1`, [quarter.id]),
    ).rejects.toThrow(/never change/);
  }, 120000);
});
