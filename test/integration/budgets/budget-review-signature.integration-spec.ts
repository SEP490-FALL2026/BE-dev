import request from 'supertest';
import { nthWorkingDayFrom } from '../../../src/core/working-days';
import { TransactionRunner } from '../../../src/infrastructure/database/transaction-runner';
import {
  BudgetReviewPoolWatchService,
  type SharedPoolFigures,
} from '../../../src/modules/budgets/review/budget-review-pool-watch.service';
import { BudgetReviewReminderService } from '../../../src/modules/budgets/review/budget-review-reminder.service';
import { OperatingParametersApi } from '../../../src/modules/operating-parameters/public/operating-parameters.api';
import { InvoiceHarness } from '../../support/invoice-harness';
import { pretendBusinessToday } from '../../support/pretend-today';
import type { Unit } from '../../support/spend-harness';

const h = new InvoiceHarness();
const M = 1_000_000;

interface PeriodWire {
  id: string;
  month: number;
  kind: string;
  state: string;
  note: string | null;
  signedBy: { employeeId: string } | null;
  signedAt: string | null;
  lightCounts: Record<string, number>;
}
interface NoticeRow {
  recipient_employee_id: string;
  params: Record<string, unknown>;
  event_key: string;
}

/**
 * The signature of a month closed and the reminders of the close (`RV-1.4`, `QĐ-111ae`, R-47, `QĐ-104i`): only Finance signs, once, and the spending approver is told
 * the table of lights; on the fifth working day Finance is asked for the month before when it is not closed; the shared pool above its reserve is warned
 * about once for each month.
 */
describe('Finance signs a month closed and is reminded to close the next (integration; RV-1.4)', () => {
  let a: Unit;
  const year = () => h.year;
  const afterYear = () => `${h.year + 1}`;
  const closing = (body: Record<string, unknown>) =>
    request(h.server()).post('/api/v1/budget-review-periods').set(h.as(h.finance)).send(body);
  const signing = (id: string, account: Parameters<typeof h.as>[0] = h.finance, body: Record<string, unknown> = {}) =>
    request(h.server()).post(`/api/v1/budget-review-periods/${id}/signature`).set(h.as(account)).send(body);
  const closed = async (month: number): Promise<PeriodWire> =>
    h.dataOf<PeriodWire>(await closing({ year: year(), month }).expect(201));
  const noticesOf = async (code: string): Promise<NoticeRow[]> =>
    (
      await h.ctx.sql.query<NoticeRow>(
        `SELECT recipient_employee_id, params, event_key FROM in_app_notifications WHERE code = $1 ORDER BY event_key`,
        [code],
      )
    ).rows;
  const reminders = () => h.ctx.app.get(BudgetReviewReminderService, { strict: false });

  beforeAll(async () => {
    await h.start();
    await h.withApprover();
    a = await h.departmentWithHead('P-RV1S');
    await h.budgetFor(a, { total: 300 * M, reserve: 30 * M });
    // After the year: every month of it has ended, and the heads named today are heads on that day.
    pretendBusinessToday(h.ctx.app, `${afterYear()}-01-10`);
  }, 300000);

  afterAll(async () => {
    jest.restoreAllMocks();
    await h.stop();
  });

  it('Finance signs a month: who, when and the note are kept, the period is signed for good, and the spending approver is told how many Cost Centers have each light', async () => {
    const month = await closed(4);

    const signed = h.dataOf<PeriodWire>(
      await signing(month.id, h.finance, { note: 'Reviewed on the figures' }).expect(200),
    );

    expect(signed).toMatchObject({
      state: 'SIGNED',
      note: 'Reviewed on the figures',
      signedBy: { employeeId: h.finance.employeeId },
    });
    expect(signed.signedAt).not.toBeNull();
    const told = (await noticesOf('BUDGET_REVIEW_SUMMARY')).filter((row) => row.params.periodId === month.id);
    expect(told).toHaveLength(1);
    expect(told[0].recipient_employee_id).toBe(h.deciderOf().employeeId);
    expect(told[0].params).toMatchObject({ year: year(), month: 4, kind: 'MONTH' });
    expect(
      Number(told[0].params.greenCount) +
        Number(told[0].params.yellowCount) +
        Number(told[0].params.redCount) +
        Number(told[0].params.underCount),
    ).toBe(Object.values(month.lightCounts).reduce((sum, count) => sum + count, 0));
    expect(Object.keys(told[0].params).join(' ')).not.toMatch(/amount|budget|remaining/i);
  });

  it('signs once: a second signature is a 409 and the first stays, and the period does not change', async () => {
    const month = await closed(5);
    const first = h.dataOf<PeriodWire>(await signing(month.id).expect(200));

    const again = await signing(month.id, h.finance, { note: 'Again' }).expect(409);

    expect((again.body as { error: { code: string } }).error.code).toBe('BUDGET_REVIEW.ALREADY_SIGNED');
    const row = await h.ctx.sql.query<{ note: string | null; signed_at: Date }>(
      `SELECT note, signed_at FROM budget_review_periods WHERE id = $1`,
      [month.id],
    );
    expect(row.rows[0].note).toBeNull();
    expect(row.rows[0].signed_at.toISOString()).toBe(first.signedAt);
    expect((await noticesOf('BUDGET_REVIEW_SUMMARY')).filter((one) => one.params.periodId === month.id)).toHaveLength(
      1,
    );
  });

  it('QĐ-111ae: only Finance signs, not the spending approver, not a manager, and an id that is not a period is a 404', async () => {
    const month = await closed(6);

    await signing(month.id, h.deciderOf()).expect(403);
    await signing(month.id, a.head.account).expect(403);
    await signing('00000000-0000-4000-8000-000000000000').expect(404);
    expect(h.dataOf<PeriodWire>(await signing(month.id).expect(200)).kind).toBe('QUARTER');
  });

  it('asks Finance for the month before on the fifth working day, once, not on another day, and not when the month is closed', async () => {
    const parameters = h.ctx.app.get(OperatingParametersApi, { strict: false });
    const first = `${afterYear()}-02-01`;
    const nonWorking = await parameters.getNonWorkingDates(first, `${afterYear()}-03-01`);
    const fifth = nthWorkingDayFrom(first, 5, nonWorking);

    pretendBusinessToday(
      h.ctx.app,
      fifth.replace(/-\d\d$/, (day) => `-${String(Number(day.slice(1)) - 1).padStart(2, '0')}`),
    );
    await reminders().noticeDue(new Date());
    expect((await noticesOf('BUDGET_REVIEW_DUE')).filter((row) => row.params.year === h.year + 1)).toEqual([]);

    pretendBusinessToday(h.ctx.app, fifth);
    await reminders().noticeDue(new Date());
    await reminders().noticeDue(new Date());
    const asked = (await noticesOf('BUDGET_REVIEW_DUE')).filter((row) => row.params.year === h.year + 1);
    expect(asked).toHaveLength(1);
    expect(asked[0]).toMatchObject({
      recipient_employee_id: h.finance.employeeId,
      params: { year: h.year + 1, month: 1 },
    });

    // January of the year after is the fifth working day of February; December of the year closed is the fifth of January, and it is not asked when it is closed.
    pretendBusinessToday(h.ctx.app, `${afterYear()}-01-10`);
    await closed(12);
    const january = `${afterYear()}-01-01`;
    const fifthOfJanuary = nthWorkingDayFrom(january, 5, await parameters.getNonWorkingDates(january, first));
    pretendBusinessToday(h.ctx.app, fifthOfJanuary);
    await reminders().noticeDue(new Date());
    expect((await noticesOf('BUDGET_REVIEW_DUE')).filter((row) => row.params.year === h.year)).toEqual([]);
  });

  it('QĐ-104i: warns Finance once for each month the line of the shared pool is above its reserve, and never when it is not or there is no reserve', async () => {
    const watch = h.ctx.app.get(BudgetReviewPoolWatchService, { strict: false });
    const runner = h.ctx.app.get(TransactionRunner, { strict: false });
    const over: SharedPoolFigures = {
      unallocatedMinor: 6_000_000n,
      reserveMinor: 5_000_000n,
      annualCeilingMinor: null,
      overReserve: true,
    };
    const tell = (month: number, figures: SharedPoolFigures) =>
      runner.run((tx) => watch.tellFinance(tx, h.seed.organizationId, h.year, month, figures));

    expect(await tell(8, over)).toBe(true);
    expect(await tell(8, over)).toBe(false);
    expect(await tell(9, over)).toBe(true);
    expect(await tell(10, { ...over, unallocatedMinor: 5_000_000n, overReserve: false })).toBe(false);
    expect(await tell(11, { ...over, reserveMinor: null, overReserve: null })).toBe(false);
    const warned = (await noticesOf('BUDGET_SHARED_POOL_OVER_RESERVE')).filter((row) => row.params.year === h.year);
    expect(warned.map((row) => [row.recipient_employee_id, row.params.month])).toEqual([
      [h.finance.employeeId, 8],
      [h.finance.employeeId, 9],
    ]);
  });
});
