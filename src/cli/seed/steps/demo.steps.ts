import { as, listAll, summarize, tag, yearOf } from '../demo-step-kit';
import type { DemoRunContext, DemoStep, StepOutcome } from '../demo-run.types';
import { receiptPdf } from './pdf-builders';
import { uploadDocument } from './file-kit';
import { financePerson, money } from './finance-kit';

/*
 * The data of the council demo that is not a Request (SPEC Z2, DEMO-9…DEMO-14): contracts on subscriptions, purchase invoices in their
 * three states with one that does not match, the months of the year closed with a quarter waiting for explanations, the adjustments of a
 * locked year, and a policy published again that people must acknowledge. Each step reads what is there first and writes only what is
 * missing, through the routes and roles the screens use.
 */

type Result = { status: StepOutcome['status']; label: string };

const subscriptionOf = (ctx: DemoRunContext, key: string) => {
  const found = ctx.fixture.subscriptions.find((subscription) => subscription.key === key);
  if (!found) throw new Error(`The fixture has no subscription ${key}`);

  return found;
};

const vendorNameOf = (ctx: DemoRunContext, applicationKey: string): string =>
  ctx.fixture.applications.find((application) => application.key === applicationKey)?.vendorName ?? applicationKey;

const headOfCostCenter = (ctx: DemoRunContext, costCenterCode: string): string | null =>
  ctx.fixture.departments.find((department) => department.costCenter?.code === costCenterCode)?.head ?? null;

interface PeriodRow {
  id: string;
  month: number;
  kind: string;
  state: string;
}

interface PeriodLine {
  costCenter: { id: string; code: string } | null;
  explanationStatus: string;
}

export function quartersToSign(periods: readonly PeriodRow[]): PeriodRow[] {
  const quarters = periods.filter((period) => period.kind === 'QUARTER').sort((a, b) => a.month - b.month);
  return quarters.slice(0, -1).filter((period) => period.state !== 'SIGNED');
}

export function explanationMove(
  lines: readonly PeriodLine[],
): { kind: 'present' } | { kind: 'limited'; pending: number } | { kind: 'explain'; line: PeriodLine } {
  const explained = lines.filter((line) => line.explanationStatus === 'EXPLAINED').length;
  if (explained >= 2) return { kind: 'present' };
  const pending = lines.filter((line) => line.costCenter !== null && line.explanationStatus === 'PENDING');
  if (pending.length < 3 - explained) return { kind: 'limited', pending: pending.length };
  const line =
    pending.find((row) => row.costCenter?.code === 'CC-FIN') ??
    pending.find((row) => row.costCenter?.code === 'CC-DES') ??
    pending[0];
  return { kind: 'explain', line };
}

/**
 * DEMO-12/13: Finance closes the months of the year that have ended, up to October (a quarter month opens explanations); in the last
 * quarter closed two heads explain and at least one waits; Finance signs every older quarter.
 */
async function reviews(ctx: DemoRunContext): Promise<StepOutcome> {
  const finance = await as(ctx, financePerson(ctx));
  const year = yearOf(ctx).year;
  const last = Math.min(10, Number(ctx.today.slice(5, 7)) - 1);
  if (last < 1) return { status: 'present', detail: 'chưa có tháng nào của năm đã hết' };
  const closed = await listAll<PeriodRow>(ctx, finance, `/budget-review-periods?year=${year}`);
  const results: Result[] = [];
  for (let month = 1; month <= last; month++) {
    if (closed.some((period) => period.month === month)) {
      results.push({ status: 'present', label: `tháng ${month}` });
      continue;
    }
    if (ctx.mode === 'plan') {
      results.push({ status: 'planned', label: `tháng ${month}` });
      continue;
    }
    closed.push(await ctx.api.call<PeriodRow>(finance, 'POST', '/budget-review-periods', { year, month }));
    results.push({ status: 'done', label: `tháng ${month}` });
  }
  for (const quarter of quartersToSign(closed)) {
    if (ctx.mode === 'plan') results.push({ status: 'planned', label: `ký quý tháng ${quarter.month}` });
    else {
      await ctx.api.call(finance, 'POST', `/budget-review-periods/${quarter.id}/signature`, {
        note: `${tag(ctx, 'REVIEW')} Ký kỳ quý đã qua.`,
      });
      quarter.state = 'SIGNED';
      results.push({ status: 'done', label: `ký quý tháng ${quarter.month}` });
    }
  }
  const quarter = closed
    .filter((period) => period.kind === 'QUARTER' && period.state === 'AWAITING_EXPLANATIONS')
    .sort((a, b) => b.month - a.month)[0];
  if (quarter) results.push(await explainOne(ctx, finance, quarter));

  return summarize(results);
}

async function explainOne(ctx: DemoRunContext, finance: string, quarter: PeriodRow): Promise<Result> {
  const label = `giải trình quý (tháng ${quarter.month})`;
  const written: string[] = [];
  for (let attempt = 0; attempt < 2; attempt++) {
    const detail = await ctx.api.call<{ items: PeriodLine[] }>(
      finance,
      'GET',
      `/budget-review-periods/${quarter.id}?pageSize=100`,
    );
    const lines = detail.items.filter((line) => line.costCenter && headOfCostCenter(ctx, line.costCenter.code));
    const move = explanationMove(lines);
    if (move.kind === 'present') return { status: written.length ? 'done' : 'present', label };
    if (move.kind === 'limited')
      return {
        status: 'present',
        label: `${label}: ${move.pending} dòng chờ, không đủ hai giải trình và một dòng còn chờ`,
      };
    if (ctx.mode === 'plan') return { status: 'planned', label };
    await explainLine(ctx, quarter.id, move.line);
    written.push(move.line.costCenter?.code ?? '?');
  }
  return { status: 'done', label: `${label}: ${written.join(', ')}` };
}

async function explainLine(ctx: DemoRunContext, quarterId: string, line: PeriodLine): Promise<void> {
  const head = await as(ctx, headOfCostCenter(ctx, line.costCenter?.code ?? '') ?? '');
  await ctx.api.call(head, 'PUT', `/budget-review-periods/${quarterId}/lines/${line.costCenter?.id}/explanation`, {
    cause: 'Mua thêm ghế cho người mới vào giữa quý, chưa có trong số đề xuất đầu năm.',
    persistence: 'ONE_OFF',
    action: 'Rà soát ghế không dùng trong tháng tới và thu hồi trước kỳ gia hạn.',
    knownNeedsToYearEnd: { amount: money('0'), note: 'Không có nhu cầu mới tới cuối năm.' },
  });
}

/**
 * DEMO-14: the adjustments of the year — a supplement waiting for the spending approver and a transfer approved. An adjustment is asked only
 * of a locked cycle (FIX-AD1-Q2): the cycle of the year locks the day after the seed, so this step writes on a run from that day (D-Z2-1).
 */
async function adjustments(ctx: DemoRunContext): Promise<StepOutcome> {
  const finance = await as(ctx, financePerson(ctx));
  const year = yearOf(ctx).year;
  const cycle = await ctx.api.call<{ status: string }>(finance, 'GET', `/budget-cycles/${year}`);
  const existing = await listAll<{ id: string; reason: string; state: string }>(
    ctx,
    finance,
    `/budget-adjustments?year=${year}`,
  );
  const ours = existing.filter((row) => row.reason.startsWith(tag(ctx, 'ADJ')));
  if (ours.length >= 2) return { status: 'present', detail: 'đã có Bổ sung chờ duyệt và Chuyển đã duyệt' };
  if (cycle.status !== 'LOCKED') {
    return {
      status: 'present',
      detail: `kỳ ${year} chưa khóa (khóa từ ngày sau hạn nộp): chạy lại seed từ ngày đó để có điều chỉnh (D-Z2-1)`,
    };
  }
  if (ctx.mode === 'plan') return { status: 'planned', detail: 'Bổ sung + Chuyển' };
  const unit = (code: string) => ctx.ids.costCenters.get(code) ?? '';
  if (!ours.some((row) => row.reason.includes('Bổ sung'))) {
    await ctx.api.call(finance, 'POST', '/budget-adjustments', {
      year,
      kind: 'SUPPLEMENT',
      toCostCenterId: unit('ITO'),
      amount: money('5000000'),
      reason: `${tag(ctx, 'ADJ')} Bổ sung cho gia hạn 1Password của phòng IT.`,
    });
  }
  if (!ours.some((row) => row.reason.includes('Chuyển'))) {
    const transfer = await ctx.api.call<{ id: string }>(finance, 'POST', '/budget-adjustments', {
      year,
      kind: 'TRANSFER',
      fromCostCenterId: unit('ENG'),
      toCostCenterId: unit('BOD'),
      amount: money('5000000'),
      reason: `${tag(ctx, 'ADJ')} Chuyển phần Kỹ thuật chưa dùng sang Ban Giám đốc.`,
    });
    const approver = await as(ctx, ctx.fixture.approvalRoles.SPENDING_APPROVER);
    await ctx.api.call(approver, 'POST', `/budget-adjustments/${transfer.id}/decision`, { decision: 'APPROVE' });
  }

  return { status: 'done', detail: 'Bổ sung chờ duyệt, Chuyển đã duyệt' };
}

interface DiscrepancyRow {
  id: string;
  source: string;
  identity: string | null;
  employeeId: string | null;
  outOfProcessCaseId: string | null;
}

/**
 * What Finance records as spent for the Jira that a Sales employee bought himself for two months (D-16): over the base and the reserve of
 * Sales (290.000 + 29.000), so the department shows the red light; R11 of Sales stays blocked whatever this amount is.
 */
export const OUT_OF_PROCESS_SPENT = '400000';

/**
 * DEMO-11 (`SBF-07a`): of the accounts the Jira usage file shows with no seat (`SBF-08`), the IT Admin of Jira sends NV-SAL1's out of
 * process (not a company asset), and Finance records what it cost with the receipt, charged to Sales: the case closes. The other account
 * and the unknown identity of the Figma file stay open (`SBF-08` keeps two values).
 */
async function outOfProcess(ctx: DemoRunContext): Promise<StepOutcome> {
  const admin = await as(ctx, subscriptionOf(ctx, 'jira').responsible);
  const finance = await as(ctx, financePerson(ctx));
  const identity = `${ctx.fixture.people.find((p) => p.code === 'NV-SAL1')?.email}@${ctx.fixture.emailDomain}`;
  const rows = await listAll<DiscrepancyRow>(ctx, admin, '/vendor-account-discrepancies');
  const employeeId = ctx.ids.employees.get('NV-SAL1');
  const found = rows.find(
    (row) =>
      row.source === 'NO_ASSIGNMENT' && (row.employeeId === employeeId || row.identity?.toLowerCase() === identity),
  );
  if (!found) {
    const seen = rows.map((row) => `${row.source}:${row.employeeId ?? row.identity ?? '?'}`).join(', ');
    return { status: 'conflict', detail: `không có sai lệch NO_ASSIGNMENT của ${identity} (có: ${seen || 'không'})` };
  }
  let caseId = found.outOfProcessCaseId;
  if (caseId) {
    const cases = await listAll<{ id: string; outcome: string | null }>(ctx, finance, '/out-of-process-cases');
    if (cases.find((row) => row.id === caseId)?.outcome)
      return { status: 'present', detail: 'ca ngoài quy trình đã ghi phần đã chi' };
  }
  if (ctx.mode === 'plan') return { status: 'planned', detail: 'quyết OUT_OF_PROCESS rồi Finance ghi phần đã chi' };
  if (!caseId) {
    const decided = await ctx.api.call<{ outOfProcessCaseId: string | null }>(
      admin,
      'POST',
      `/vendor-account-discrepancies/${found.id}/decision`,
      {
        decision: 'OUT_OF_PROCESS',
        companyAsset: false,
        note: `${tag(ctx, 'SBF07')} Nhân viên Kinh doanh tự mua Jira bằng thẻ cá nhân, không qua Request.`,
      },
    );
    caseId = decided.outOfProcessCaseId;
  }
  if (!caseId) return { status: 'conflict', detail: 'quyết định không mở ca ngoài quy trình' };
  const pdf = await receiptPdf({
    number: 'bien-nhan-jira-ca-nhan',
    vendor: vendorNameOf(ctx, 'jira'),
    amount: OUT_OF_PROCESS_SPENT,
    issuedOn: ctx.today,
    note: 'Nhân viên Kinh doanh tự mua Jira hai tháng bằng thẻ cá nhân, Finance ghi phần đã chi theo biên nhận.',
  });
  const receipt = await uploadDocument(ctx, finance, 'PURCHASE_DOCUMENT', pdf);
  await ctx.api.call(finance, 'POST', `/out-of-process-cases/${caseId}/closure`, {
    outcome: 'RECORD_SPENT',
    note: `${tag(ctx, 'SBF07')} Ghi phần đã chi theo biên nhận, tính cho phòng Kinh doanh.`,
    documentIds: [receipt],
    amount: money(OUT_OF_PROCESS_SPENT),
    costCenterId: ctx.ids.costCenters.get('SAL'),
  });

  return { status: 'done', detail: 'ca ngoài quy trình: đã ghi phần đã chi kèm chứng từ' };
}

/** DEMO-8: the Slack seat an IT Admin holds for the bot of IT alerts is marked a machine account, so no ghost-seat rule reports it. */
async function machineAccount(ctx: DemoRunContext): Promise<StepOutcome> {
  const admin = await as(ctx, subscriptionOf(ctx, 'slack').responsible);
  const holder = ctx.ids.employees.get('NV-ITA3');
  const rows = await listAll<{ id: string; isMachineAccount?: boolean }>(
    ctx,
    admin,
    `/license-assignments?employeeId=${holder}&subscriptionId=${ctx.ids.subscriptions.get('slack')}`,
  );
  const seat = rows[0];
  if (!seat) return { status: 'conflict', detail: 'NV-ITA3 không có ghế Slack' };
  if (seat.isMachineAccount) return { status: 'present', detail: 'ghế Slack của NV-ITA3 là tài khoản máy' };
  if (ctx.mode === 'plan') return { status: 'planned', detail: 'đánh dấu tài khoản máy' };
  await ctx.api.call(admin, 'POST', `/license-assignments/${seat.id}/machine-account`, {
    isMachineAccount: true,
    note: 'Bot đăng cảnh báo của phòng IT lên kênh #it-alerts.',
  });

  return { status: 'done', detail: 'ghế Slack của NV-ITA3 là tài khoản máy' };
}

/** DEMO-5: the holder of a Postman seat that ends in 7 days asks to carry it on 3 months; the request waits for the head (R33). */
async function renewal(ctx: DemoRunContext): Promise<StepOutcome> {
  const holderCode = 'NV-SAL2';
  const holder = await as(ctx, holderCode);
  const marker = tag(ctx, 'R33');
  // The list of one's own requests carries no reason: each is read whole to find the one of the dataset.
  for (const row of await listAll<{ id: string }>(ctx, holder, '/me/access-requests')) {
    const read = await ctx.api.call<{ request: { state: string; businessReason?: string | null } }>(
      holder,
      'GET',
      `/access-requests/${row.id}`,
    );
    if (read.request.businessReason?.startsWith(marker))
      return { status: 'present', detail: `R33 ${read.request.state}` };
  }
  if (ctx.mode === 'plan') return { status: 'planned', detail: 'gửi Request tiếp tục' };
  const admin = await as(ctx, subscriptionOf(ctx, 'postman').responsible);
  const seats = await listAll<{ id: string }>(
    ctx,
    admin,
    `/license-assignments?employeeId=${ctx.ids.employees.get(holderCode)}&subscriptionId=${ctx.ids.subscriptions.get('postman')}`,
  );
  if (!seats[0]) return { status: 'conflict', detail: `${holderCode} không có ghế Postman` };
  const sent = await ctx.api.call<{ outcome: string }>(holder, 'POST', '/access-requests/renewals', {
    assignmentId: seats[0].id,
    extensionMonths: 3,
    businessReason: `${marker} Dự án kiểm thử API với khách hàng kéo dài thêm một quý.`,
  });

  return { status: 'done', detail: `R33 ${sent.outcome}` };
}

/** The policy published again with a re-acknowledgement asked (SPEC Z2 "1 bản chờ xác nhận"): every person it applies to must read it. */
const REPUBLISHED_POLICY = 'POL-MF2';

async function policyAgain(ctx: DemoRunContext): Promise<StepOutcome> {
  const admin = ctx.superAdminEmail;
  const current = await ctx.api.call<{ versionNumber: number; applicableRoles: string[] }>(
    admin,
    'GET',
    `/policies/${REPUBLISHED_POLICY}`,
  );
  if (current.versionNumber > 1)
    return { status: 'present', detail: `${REPUBLISHED_POLICY} bản ${current.versionNumber}` };
  if (ctx.mode === 'plan') return { status: 'planned', detail: `xuất bản lại ${REPUBLISHED_POLICY}` };
  await ctx.api.call(admin, 'PUT', `/policies/${REPUBLISHED_POLICY}/draft`, {});
  await ctx.api.call(admin, 'POST', `/policies/${REPUBLISHED_POLICY}/draft/publish`, {
    changeNote: 'Làm rõ hạn thu hồi quyền khi nghỉ việc: tính theo ngày làm việc sau ngày làm việc cuối.',
    applicableRoles: current.applicableRoles,
    requiresReacknowledgement: true,
  });

  return { status: 'done', detail: `${REPUBLISHED_POLICY} bản 2, chờ xác nhận lại` };
}

export const DEMO_STEPS: readonly DemoStep[] = [
  {
    key: 'demo.budget-adjustments',
    title: 'Điều chỉnh ngân sách năm khi kỳ đã khóa: Bổ sung chờ duyệt, Chuyển đã duyệt (DEMO-14)',
    needs: ['budget.year', 'org.approval-roles'],
    run: adjustments,
  },
  {
    key: 'demo.out-of-process',
    title: 'Sai lệch tài khoản nhà cung cấp → ca ngoài quy trình, Finance ghi phần đã chi kèm chứng từ (DEMO-11)',
    needs: ['usage.imports', 'finance.cost-centers'],
    run: outOfProcess,
  },
  {
    key: 'demo.machine-account',
    title: 'Ghế Slack của IT Admin là tài khoản máy, không bị báo ghost seat (DEMO-8)',
    needs: ['catalog.baseline-close'],
    run: machineAccount,
  },
  {
    key: 'demo.renewal',
    title: 'Quyền Postman hết sau 7 ngày, Request tiếp tục chờ trưởng phòng (DEMO-5, R33)',
    needs: ['catalog.baseline-close', 'org.heads'],
    run: renewal,
  },
  {
    key: 'demo.policy-reacknowledgement',
    title: 'Một chính sách xuất bản lại, chờ xác nhận lại (Super Admin)',
    needs: ['org.accounts'],
    run: policyAgain,
  },
  {
    key: 'demo.budget-reviews',
    title: 'Chốt tháng, ký quý cũ và hai giải trình ở quý mới nhất (Finance, trưởng phòng)',
    needs: ['budget.year', 'demo.purchase-invoices', 'demo.out-of-process'],
    run: reviews,
  },
];
