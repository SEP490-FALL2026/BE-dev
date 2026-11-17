import { as, listAll, summarize, tag, yearOf } from '../demo-step-kit';
import { dayOffset } from '../demo-dates';
import type { DemoRunContext, DemoStep, StepOutcome } from '../demo-run.types';
import { contractPdf, invoicePdf, receiptPdf } from './pdf-builders';
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

const vendorOfPlan = (ctx: DemoRunContext, planKey: string): string =>
  ctx.fixture.applications.find((application) => application.plans.some((plan) => plan.key === planKey))?.vendorName ??
  planKey;

const headOfCostCenter = (ctx: DemoRunContext, costCenterCode: string): string | null =>
  ctx.fixture.departments.find((department) => department.costCenter?.code === costCenterCode)?.head ?? null;

/** DEMO-9: one contract per vendor, each holding its subscription (K2 Jira, K4 JetBrains All), with its signed file. */
const CONTRACTS = [
  { number: 'SV-HD-ATL-01', name: 'Hợp đồng Atlassian (Jira Software)', application: 'jira', subscriptions: ['jira'] },
  {
    number: 'SV-HD-JB-01',
    name: 'Hợp đồng JetBrains (All Products)',
    application: 'jetbrains',
    subscriptions: ['jetbrains'],
  },
];

async function contracts(ctx: DemoRunContext): Promise<StepOutcome> {
  const results: Result[] = [];
  for (const spec of CONTRACTS) {
    const admin = await as(ctx, subscriptionOf(ctx, spec.subscriptions[0]).responsible);
    const existing = await listAll<{ id: string; number: string | null }>(ctx, admin, '/contracts');
    if (existing.some((row) => row.number === spec.number)) {
      results.push({ status: 'present', label: spec.number });
      continue;
    }
    if (ctx.mode === 'plan') {
      results.push({ status: 'planned', label: spec.number });
      continue;
    }
    const effective = { from: dayOffset(ctx.today, -200), to: dayOffset(ctx.today, 165) };
    const created = await ctx.api.call<{ contract: { id: string } }>(admin, 'POST', '/contracts', {
      name: spec.name,
      number: spec.number,
      vendorId: ctx.ids.vendors.get(spec.application),
      effectiveFrom: effective.from,
      effectiveTo: effective.to,
      note: `${tag(ctx, 'CONTRACT')} Hợp đồng khung một năm, gia hạn theo thuê bao.`,
    });
    const contractId = created.contract.id;
    for (const key of spec.subscriptions) {
      await ctx.api.call(admin, 'POST', `/contracts/${contractId}/subscriptions`, {
        subscriptionId: ctx.ids.subscriptions.get(key),
      });
    }
    const pdf = await contractPdf({
      number: spec.number,
      name: spec.name,
      vendor: vendorNameOf(ctx, spec.application),
      effectiveFrom: effective.from,
      effectiveTo: effective.to,
    });
    const file = await uploadDocument(ctx, admin, 'CONTRACT_ATTACHMENT', pdf);
    await ctx.api.call(admin, 'POST', `/documents/${file}/attach`, { contractId });
    results.push({ status: 'done', label: spec.number });
  }

  return summarize(results);
}

/**
 * DEMO-10/11: purchase invoices of the shared pool for the month of the seed, sent by the IT Admin in charge of the subscription and left in
 * each state: one waits for Finance's signature, one is signed, one returned, and one signed with more seats than were bought (12 against
 * 7), which opens a discrepancy case (`SBF-11a`).
 */
const INVOICES = [
  { number: 'SV-INV-001', subscription: 'jira', quantity: 10, target: 'SUBMITTED' },
  { number: 'SV-INV-002', subscription: 'slack', quantity: 9, target: 'CONFIRMED' },
  { number: 'SV-INV-003', subscription: 'github', quantity: 9, target: 'RETURNED' },
  { number: 'SV-INV-004', subscription: 'postman', quantity: 12, target: 'CONFIRMED' },
] as const;

interface InvoiceRow {
  id: string;
  state: string;
  vendorInvoiceNumber: string;
}

async function invoices(ctx: DemoRunContext): Promise<StepOutcome> {
  const finance = await as(ctx, financePerson(ctx));
  const existing = await listAll<InvoiceRow>(ctx, finance, '/purchase-invoices');
  const results: Result[] = [];
  for (const spec of INVOICES) {
    const label = `${spec.number} → ${spec.target}`;
    let row = existing.find((candidate) => candidate.vendorInvoiceNumber === spec.number);
    if (row && (row.state === spec.target || row.state !== 'SUBMITTED')) {
      results.push({ status: row.state === spec.target ? 'present' : 'conflict', label });
      continue;
    }
    if (ctx.mode === 'plan') {
      results.push({ status: 'planned', label });
      continue;
    }
    if (!row) {
      const subscription = subscriptionOf(ctx, spec.subscription);
      const admin = await as(ctx, subscription.responsible);
      const price = BigInt(subscription.unitPrice.amount);
      const netAmount = (price * BigInt(spec.quantity)).toString();
      const pdf = await invoicePdf({
        vendorInvoiceNumber: spec.number,
        vendorName: vendorOfPlan(ctx, subscription.plan),
        issuedOn: ctx.today,
        servicePeriodMonth: ctx.today.slice(0, 7),
        quantity: spec.quantity,
        unitPrice: price.toString(),
        netAmount,
      });
      const document = await uploadDocument(ctx, admin, 'PURCHASE_DOCUMENT', pdf);
      row = await ctx.api.call<InvoiceRow>(admin, 'POST', '/purchase-invoices', {
        link: { subscriptionId: ctx.ids.subscriptions.get(spec.subscription) },
        vendorInvoiceNumber: spec.number,
        issuedOn: ctx.today,
        servicePeriodMonth: ctx.today.slice(0, 7),
        quantity: spec.quantity,
        unitPriceOriginal: { amount: price.toString(), currency: 'VND' },
        netAmount: money(netAmount),
        paymentSource: 'COMPANY_CARD',
        documentIds: [document],
      });
    }
    if (spec.target === 'CONFIRMED') await ctx.api.call(finance, 'POST', `/purchase-invoices/${row.id}/confirmation`);
    if (spec.target === 'RETURNED') {
      await ctx.api.call(finance, 'POST', `/purchase-invoices/${row.id}/return`, {
        reason: `${tag(ctx, spec.number)} Hóa đơn thiếu mã số thuế của nhà cung cấp; nộp lại bản đúng.`,
      });
    }
    results.push({ status: 'done', label });
  }

  return summarize(results);
}

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

/**
 * DEMO-12/13: Finance closes the months of the year that have ended, up to October (a quarter month opens explanations); in the last
 * quarter closed one head explains its line and the others wait; Finance does not sign.
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
  const quarter = closed
    .filter((period) => period.kind === 'QUARTER' && period.state === 'AWAITING_EXPLANATIONS')
    .sort((a, b) => b.month - a.month)[0];
  if (quarter) results.push(await explainOne(ctx, finance, quarter));

  return summarize(results);
}

async function explainOne(ctx: DemoRunContext, finance: string, quarter: PeriodRow): Promise<Result> {
  const label = `giải trình quý (tháng ${quarter.month})`;
  const detail = await ctx.api.call<{ items: PeriodLine[] }>(
    finance,
    'GET',
    `/budget-review-periods/${quarter.id}?pageSize=100`,
  );
  const lines = detail.items.filter((line) => line.costCenter && headOfCostCenter(ctx, line.costCenter.code));
  if (lines.some((line) => line.explanationStatus === 'EXPLAINED')) return { status: 'present', label };
  const pending = lines.filter((line) => line.explanationStatus === 'PENDING');
  // One head explains, at least one other is left waiting (DEMO-13); with a single line asked nothing is explained.
  if (pending.length < 2) return { status: 'present', label: `${label}: ${pending.length} dòng chờ, không giải trình` };
  if (ctx.mode === 'plan') return { status: 'planned', label };
  const line = pending[0];
  const head = await as(ctx, headOfCostCenter(ctx, line.costCenter?.code ?? '') ?? '');
  await ctx.api.call(head, 'PUT', `/budget-review-periods/${quarter.id}/lines/${line.costCenter?.id}/explanation`, {
    cause: 'Mua thêm ghế cho người mới vào giữa quý, chưa có trong số đề xuất đầu năm.',
    persistence: 'ONE_OFF',
    action: 'Rà soát ghế không dùng trong tháng tới và thu hồi trước kỳ gia hạn.',
    knownNeedsToYearEnd: { amount: money('0'), note: 'Không có nhu cầu mới tới cuối năm.' },
  });

  return { status: 'done', label: `${label}: ${line.costCenter?.code}` };
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
    amount: '200000',
    issuedOn: ctx.today,
    note: 'Nhân viên Kinh doanh tự mua Jira bằng thẻ cá nhân, Finance ghi phần đã chi theo biên nhận.',
  });
  const receipt = await uploadDocument(ctx, finance, 'PURCHASE_DOCUMENT', pdf);
  await ctx.api.call(finance, 'POST', `/out-of-process-cases/${caseId}/closure`, {
    outcome: 'RECORD_SPENT',
    note: `${tag(ctx, 'SBF07')} Ghi phần đã chi theo biên nhận, tính cho phòng Kinh doanh.`,
    documentIds: [receipt],
    amount: money('200000'),
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
    key: 'demo.contracts',
    title: 'Hợp đồng gắn thuê bao K2 và K4, có tệp (IT Admin, DEMO-9)',
    needs: ['catalog.subscriptions'],
    run: contracts,
  },
  {
    key: 'demo.purchase-invoices',
    title: 'Hóa đơn mua: chờ ký, đã ký, bị trả, một hóa đơn lệch số lượng (IT Admin → Finance, DEMO-10/11)',
    needs: ['catalog.subscriptions', 'org.accounts'],
    run: invoices,
  },
  {
    key: 'demo.budget-reviews',
    title: 'Chốt số các tháng đã qua của năm, quý chờ giải trình (Finance, trưởng phòng; DEMO-12/13)',
    needs: ['budget.year'],
    run: reviews,
  },
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
];
