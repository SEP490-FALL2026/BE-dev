import { as, listAll, summarize, tag } from '../demo-step-kit';
import { dayOffset } from '../demo-dates';
import type { DemoRunContext, DemoStep, StepOutcome } from '../demo-run.types';
import { contractPdf, invoicePdf } from './pdf-builders';
import { uploadDocument } from './file-kit';
import { financePerson, money } from './finance-kit';

type Result = { status: StepOutcome['status']; label: string };
interface ContractFixture {
  number: string;
  name: string;
  application: string;
  subscriptions: string[];
  openEnded?: boolean;
}
export interface InvoiceFixture {
  number: string;
  subscription: string;
  quantity: number;
  target: 'SUBMITTED' | 'CONFIRMED' | 'RETURNED' | 'RESUBMITTED';
  resubmitAs?: string;
  request?: string;
  reviewMonthOffset?: number;
}
export interface InvoiceRow {
  id: string;
  state: string;
  vendorInvoiceNumber: string;
}

const subscriptionOf = (ctx: DemoRunContext, key: string) => {
  const found = ctx.fixture.subscriptions.find((subscription) => subscription.key === key);
  if (!found) throw new Error(`The fixture has no subscription ${key}`);
  return found;
};
const vendorNameOf = (ctx: DemoRunContext, applicationKey: string) =>
  ctx.fixture.applications.find((application) => application.key === applicationKey)?.vendorName ?? applicationKey;
const vendorOfPlan = (ctx: DemoRunContext, planKey: string) =>
  ctx.fixture.applications.find((application) => application.plans.some((plan) => plan.key === planKey))?.vendorName ??
  planKey;

export const CONTRACTS: ContractFixture[] = [
  { number: 'SV-HD-ATL-01', name: 'Hợp đồng Atlassian (Jira Software)', application: 'jira', subscriptions: ['jira'] },
  {
    number: 'SV-HD-JB-01',
    name: 'Hợp đồng JetBrains (All Products)',
    application: 'jetbrains',
    subscriptions: ['jetbrains'],
  },
  {
    number: 'SV-HD-MS-01',
    name: 'Hợp đồng Microsoft (365 và Visio)',
    application: 'm365',
    subscriptions: ['m365-basic', 'm365-standard', 'visio-pro'],
  },
  {
    number: 'SV-HD-ADB-01',
    name: 'Hợp đồng Adobe (Creative Cloud Teams)',
    application: 'adobe',
    subscriptions: ['adobe-cc-teams'],
  },
  {
    number: 'SV-HD-ZM-01',
    name: 'Hợp đồng Zoom',
    application: 'zoom',
    subscriptions: ['zoom-pro', 'zoom-business'],
    openEnded: true,
  },
];

export function contractBody(ctx: DemoRunContext, spec: ContractFixture) {
  return {
    name: spec.name,
    number: spec.number,
    vendorId: ctx.ids.vendors.get(spec.application),
    effectiveFrom: dayOffset(ctx.today, -200),
    ...(spec.openEnded ? {} : { effectiveTo: dayOffset(ctx.today, 165) }),
    note: `${tag(ctx, 'CONTRACT')} Hợp đồng mô phỏng, gia hạn theo thuê bao.`,
  };
}

async function oneContract(ctx: DemoRunContext, spec: ContractFixture): Promise<Result> {
  const admin = await as(ctx, subscriptionOf(ctx, spec.subscriptions[0]).responsible);
  const existing = await listAll<{ id: string; number: string | null }>(ctx, admin, '/contracts');
  if (existing.some((row) => row.number === spec.number)) return { status: 'present', label: spec.number };
  if (ctx.mode === 'plan') return { status: 'planned', label: spec.number };
  const body = contractBody(ctx, spec);
  const { contract } = await ctx.api.call<{ contract: { id: string } }>(admin, 'POST', '/contracts', body);
  for (const key of spec.subscriptions)
    await ctx.api.call(admin, 'POST', `/contracts/${contract.id}/subscriptions`, {
      subscriptionId: ctx.ids.subscriptions.get(key),
    });
  const pdf = await contractPdf({
    number: spec.number,
    name: spec.name,
    vendor: vendorNameOf(ctx, spec.application),
    effectiveFrom: body.effectiveFrom,
    effectiveTo: body.effectiveTo ?? 'Không thời hạn',
  });
  const documentId = await uploadDocument(ctx, admin, 'CONTRACT_ATTACHMENT', pdf);
  await ctx.api.call(admin, 'POST', `/documents/${documentId}/attach`, { contractId: contract.id });
  return { status: 'done', label: spec.number };
}

async function contracts(ctx: DemoRunContext): Promise<StepOutcome> {
  const results: Result[] = [];
  for (const spec of CONTRACTS) results.push(await oneContract(ctx, spec));
  return summarize(results);
}

export const INVOICES: InvoiceFixture[] = [
  { number: 'SV-INV-001', subscription: 'jira', quantity: 10, target: 'SUBMITTED' },
  { number: 'SV-INV-002', subscription: 'slack', quantity: 9, target: 'CONFIRMED' },
  { number: 'SV-INV-003', subscription: 'github', quantity: 9, target: 'RETURNED' },
  { number: 'SV-INV-004', subscription: 'postman', quantity: 12, target: 'CONFIRMED' },
  { number: 'SV-INV-005', subscription: 'm365-basic', quantity: 18, target: 'CONFIRMED' },
  { number: 'SV-INV-006', subscription: 'zoom-pro', quantity: 7, target: 'SUBMITTED' },
  {
    number: 'SV-INV-007',
    subscription: 'notion-business',
    quantity: 8,
    target: 'RESUBMITTED',
    resubmitAs: 'SV-INV-007R',
  },
  { number: 'SV-INV-008', subscription: 'adobe-cc-teams', quantity: 7, target: 'CONFIRMED' },
  { number: 'SV-INV-009', subscription: 'hubspot-starter', quantity: 5, target: 'SUBMITTED' },
  { number: 'SV-INV-010', subscription: 'confluence-standard', quantity: 7, target: 'RETURNED' },
  {
    number: 'SV-INV-011',
    subscription: 'chatgpt',
    request: 'R18',
    reviewMonthOffset: -1,
    quantity: 1,
    target: 'CONFIRMED',
  },
  {
    number: 'SV-INV-012',
    subscription: 'copilot-pro',
    request: 'R56',
    reviewMonthOffset: 0,
    quantity: 1,
    target: 'CONFIRMED',
  },
];

/** A resubmission is a new invoice: its returned original must not cause a conflict on the next run. */
export function invoiceMove(spec: InvoiceFixture, rows: readonly InvoiceRow[]) {
  if (spec.resubmitAs && rows.some((row) => row.vendorInvoiceNumber === spec.resubmitAs)) return 'present';
  const row = rows.find((candidate) => candidate.vendorInvoiceNumber === spec.number);
  if (!row) return 'create';
  if (row.state === spec.target) return 'present';
  if (row.state === 'RETURNED' && spec.resubmitAs) return 'resubmit';
  if (row.state !== 'SUBMITTED') return 'conflict';
  return spec.target === 'CONFIRMED' ? 'confirm' : 'return';
}

function invoiceFields(ctx: DemoRunContext, spec: InvoiceFixture, documentId: string, number: string) {
  const subscription = subscriptionOf(ctx, spec.subscription);
  const price = BigInt(subscription.unitPrice.amount);
  return {
    vendorInvoiceNumber: number,
    issuedOn: ctx.today,
    servicePeriodMonth: invoiceMonth(ctx, spec),
    quantity: spec.quantity,
    unitPriceOriginal: { amount: price.toString(), currency: 'VND' },
    netAmount: money((price * BigInt(spec.quantity)).toString()),
    paymentSource: 'COMPANY_CARD',
    documentIds: [documentId],
  };
}

export function invoiceBody(ctx: DemoRunContext, spec: InvoiceFixture, documentId: string) {
  return {
    link: spec.request
      ? { requestId: ctx.ids.requests.get(spec.request) }
      : { subscriptionId: ctx.ids.subscriptions.get(spec.subscription) },
    ...invoiceFields(ctx, spec, documentId, spec.number),
  };
}

function invoiceMonth(ctx: DemoRunContext, spec: InvoiceFixture): string {
  if (spec.reviewMonthOffset === undefined) return ctx.today.slice(0, 7);
  const year = Number(ctx.today.slice(0, 4));
  const last = Math.min(10, Number(ctx.today.slice(5, 7)) - 1);
  return new Date(Date.UTC(year, last - 1 + spec.reviewMonthOffset, 1)).toISOString().slice(0, 7);
}

export function resubmissionBody(ctx: DemoRunContext, spec: InvoiceFixture, documentId: string) {
  if (!spec.resubmitAs) throw new Error('The fixture has no replacement invoice number');
  return invoiceFields(ctx, spec, documentId, spec.resubmitAs);
}

async function invoiceDocument(
  ctx: DemoRunContext,
  admin: string,
  spec: InvoiceFixture,
  number: string,
): Promise<string> {
  const subscription = subscriptionOf(ctx, spec.subscription);
  const fields = invoiceFields(ctx, spec, '', number);
  const pdf = await invoicePdf({
    vendorInvoiceNumber: number,
    vendorName: vendorOfPlan(ctx, subscription.plan),
    issuedOn: fields.issuedOn,
    servicePeriodMonth: fields.servicePeriodMonth,
    quantity: spec.quantity,
    unitPrice: fields.unitPriceOriginal.amount,
    netAmount: fields.netAmount.amount,
  });
  return uploadDocument(ctx, admin, 'PURCHASE_DOCUMENT', pdf);
}

async function oneInvoice(
  ctx: DemoRunContext,
  finance: string,
  spec: InvoiceFixture,
  rows: InvoiceRow[],
): Promise<Result> {
  const label = `${spec.number} → ${spec.target}`;
  const move = invoiceMove(spec, rows);
  if (move === 'present' || move === 'conflict') return { status: move, label };
  if (ctx.mode === 'plan') return { status: 'planned', label };
  const admin = await as(ctx, subscriptionOf(ctx, spec.subscription).responsible);
  let row = rows.find((candidate) => candidate.vendorInvoiceNumber === spec.number);
  if (!row) {
    const documentId = await invoiceDocument(ctx, admin, spec, spec.number);
    row = await ctx.api.call<InvoiceRow>(admin, 'POST', '/purchase-invoices', invoiceBody(ctx, spec, documentId));
    rows.push(row);
  }
  if (spec.target === 'CONFIRMED') await ctx.api.call(finance, 'POST', `/purchase-invoices/${row.id}/confirmation`);
  if ((spec.target === 'RETURNED' || spec.target === 'RESUBMITTED') && row.state === 'SUBMITTED') {
    await ctx.api.call(finance, 'POST', `/purchase-invoices/${row.id}/return`, {
      reason: `${tag(ctx, spec.number)} Hóa đơn thiếu mã số thuế của nhà cung cấp; nộp lại bản đúng.`,
    });
  }
  if (spec.resubmitAs) {
    const documentId = await invoiceDocument(ctx, admin, spec, spec.resubmitAs);
    rows.push(
      await ctx.api.call<InvoiceRow>(
        admin,
        'POST',
        `/purchase-invoices/${row.id}/resubmission`,
        resubmissionBody(ctx, spec, documentId),
      ),
    );
  }
  return { status: 'done', label };
}

async function invoices(ctx: DemoRunContext): Promise<StepOutcome> {
  const finance = await as(ctx, financePerson(ctx));
  const rows = await listAll<InvoiceRow>(ctx, finance, '/purchase-invoices');
  const results: Result[] = [];
  for (const spec of INVOICES) results.push(await oneInvoice(ctx, finance, spec, rows));
  return summarize(results);
}

export const DEMO_DOCUMENT_STEPS: readonly DemoStep[] = [
  {
    key: 'demo.contracts',
    title: 'Năm hợp đồng nhà cung cấp với tệp PDF (IT Admin)',
    needs: ['catalog.subscriptions'],
    run: contracts,
  },
  {
    key: 'demo.purchase-invoices',
    title: 'Hóa đơn mua chờ ký, đã ký, bị trả và đã nộp lại',
    needs: ['catalog.subscriptions', 'org.accounts'],
    run: invoices,
  },
];
