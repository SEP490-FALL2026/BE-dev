import { dayOffset } from '../demo-dates';
import { as, emailOf, listAll, summarize } from '../demo-step-kit';
import type { DemoRunContext, DemoStep, StepOutcome } from '../demo-run.types';
import type { DemoSeat } from '../fixture/demo-fixture.types';

type Result = { status: StepOutcome['status']; label: string };

/** Seats are granted this many days ago unless the fixture says otherwise: past the 90-day tier of the optimization rules. */
const DEFAULT_GRANTED_DAYS_AGO = 130;
const HEADER = 'employee_code,account_identifier,kind,granted_on,expected_end_date,reason';

const cell = (value: string): string => (/[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);

/** One line of the seat file for a seat of the fixture. */
function lineOf(ctx: DemoRunContext, seat: DemoSeat): string {
  const grantedOn = dayOffset(ctx.today, -(seat.grantedDaysAgo ?? DEFAULT_GRANTED_DAYS_AGO));
  const end = seat.endInDays === undefined ? '' : dayOffset(ctx.today, seat.endInDays);
  if (typeof seat.holder === 'string') {
    return [seat.holder, emailOf(ctx, seat.holder), 'personal', grantedOn, end, ''].map(cell).join(',');
  }
  const { serviceAccount, responsible, reason } = seat.holder;

  return [responsible, serviceAccount, 'service', grantedOn, end, reason].map(cell).join(',');
}

interface ImportPreview {
  id: string;
  previewVersion: number;
  summary: { totalRows: number; valid: number; errors: number };
}

/** The seats of one subscription: one file, previewed, confirmed under a key of the dataset (so a rerun writes none twice). */
async function oneSubscription(ctx: DemoRunContext, key: string): Promise<Result> {
  const subscription = ctx.fixture.subscriptions.find((candidate) => candidate.key === key);
  const subscriptionId = ctx.ids.subscriptions.get(key);
  if (!subscription || !subscriptionId) return { status: 'conflict', label: `${key}: thuê bao chưa có` };
  const admin = await as(ctx, subscription.responsible);
  const existing = await listAll<{ id: string }>(ctx, admin, `/license-assignments?subscriptionId=${subscriptionId}`);
  if (existing.length > 0) return { status: 'present', label: `${key}: ${existing.length} ghế nền` };
  const seats = ctx.fixture.seats.filter((seat) => seat.subscription === key);
  if (ctx.mode === 'plan') return { status: 'planned', label: `${key}: ${seats.length} ghế nền` };
  const content = [HEADER, ...seats.map((seat) => lineOf(ctx, seat))].join('\n');
  const preview = await ctx.api.upload<ImportPreview>(
    admin,
    '/seat-baseline-imports',
    { name: `${ctx.fixture.marker}-${key}-seats.csv`, content, type: 'text/csv' },
    { subscriptionId },
  );
  if (preview.summary.errors > 0 || preview.summary.valid !== seats.length) {
    return { status: 'conflict', label: `${key}: bản xem trước có ${preview.summary.errors} dòng lỗi` };
  }
  await ctx.api.call(admin, 'POST', `/seat-baseline-imports/${preview.id}/confirm`, {
    previewVersion: preview.previewVersion,
    idempotencyKey: `${ctx.fixture.marker}-BASELINE-${key}`,
  });

  return { status: 'done', label: `${key}: ${seats.length} ghế nền` };
}

async function baselineSeats(ctx: DemoRunContext): Promise<StepOutcome> {
  const keys = [...new Set(ctx.fixture.seats.map((seat) => seat.subscription))];
  const results: Result[] = [];
  for (const key of keys) results.push(await oneSubscription(ctx, key));

  return summarize(results);
}

/** The baseline closes once every file is in: after it a subscription of a plan that has one is refused as a duplicate. */
async function closeBaseline(ctx: DemoRunContext): Promise<StepOutcome> {
  const admin = await as(ctx, ctx.fixture.subscriptions[0].responsible);
  const state = await ctx.api.call<{ closed: boolean }>(admin, 'GET', '/seat-baseline');
  if (state.closed) return { status: 'present', detail: 'baseline đã đóng' };
  if (ctx.mode === 'plan') return { status: 'planned', detail: 'đóng baseline' };
  await ctx.api.call(admin, 'POST', '/seat-baseline/close');

  return { status: 'done', detail: 'đã đóng baseline' };
}

export const BASELINE_STEPS: readonly DemoStep[] = [
  {
    key: 'catalog.baseline-seats',
    title: 'Ghế nền: ai đang giữ ghế nào, cấp từ trước (IT Admin, tệp CSV)',
    needs: ['catalog.subscriptions', 'org.accounts'],
    run: baselineSeats,
  },
  {
    key: 'catalog.baseline-close',
    title: 'Đóng baseline ghế (IT Admin)',
    needs: ['catalog.baseline-seats'],
    run: closeBaseline,
  },
];
