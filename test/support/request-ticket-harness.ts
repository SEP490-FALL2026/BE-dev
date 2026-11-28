import request from 'supertest';
import type { ApiAccount } from './api-accounts';
import { approvedBudget } from './builders/budget.builder';
import { declareApplication, declarePlan, declareSubscription } from './builders/catalog.builder';
import { createCostCenter, createDepartment } from './builders/organization.builder';
import { pretendBusinessToday } from './pretend-today';
import type { Department, Person, RequestHarness } from './request-harness';
import { handOthersToSecondItAdmin } from './second-it-admin';
import { NO } from './subscription-http-harness';

const TODAY = '2026-06-01';
const YEAR = 2026;

interface TicketBudget {
  baseMinor: bigint;
  reserveMinor: bigint;
}

export interface TicketWorld {
  pDes: Department;
  other: Department;
  e1: Person;
  h1: Person;
  c1: Person;
  it1: ApiAccount;
  it2: ApiAccount;
  ccDes: { id: string; code: string } | null;
  plans: {
    figmaFull: string;
    figmaDev: string;
    miro: string;
    notion: string;
    slack: string;
    k4DeviceKey: string;
    k1Annual: string;
    k5Internal: string;
  };
  today: typeof TODAY;
}

/** Creates a ticket fixture through the real catalog, organization and budget services on a started harness. */
export async function buildTicketWorld(
  h: RequestHarness,
  opts: { withoutHead?: boolean; withoutCostCenter?: boolean; budget?: TicketBudget } = {},
): Promise<TicketWorld> {
  pretendBusinessToday(h.ctx.app, TODAY);
  jest.spyOn(h, 'today').mockReturnValue(TODAY);

  const department = await createDepartment(h.ctx, h.admin, {
    code: 'P-DES',
    name: 'Design',
    itAdminEmployeeId: h.it1.employeeId,
  });
  const ccDes = opts.withoutCostCenter
    ? null
    : await createCostCenter(h.ctx, h.finance.accessToken, {
        code: 'CC-DES',
        name: 'Design',
        kind: 'UNIT',
        departmentId: department.id,
      });
  const pDes = { ...department, unitId: ccDes?.id ?? '' };
  const other = await h.departmentWithUnit('P-OTHER');
  const e1 = await h.staff(pDes, 'W4-E1');
  const h1 = await h.staff(pDes, 'W4-H1');
  const c1 = await h.staff(other, 'W4-C1');
  if (!opts.withoutHead) await h.makeHead(pDes, h1);
  await h.setRole('SPENDING_APPROVER', c1);
  await h.setItAdminInCharge(pDes, { employeeId: h.it1.employeeId, account: h.it1 });
  const it2 = await handOthersToSecondItAdmin(h);

  if (ccDes && !opts.withoutHead) {
    await fundDesign(h, h1, c1, opts.budget ?? { baseMinor: 5_000_000n, reserveMinor: 0n });
  }

  return { pDes, other, e1, h1, c1, it1: h.it1, it2, ccDes, plans: await ticketPlans(h), today: TODAY };
}

async function fundDesign(h: RequestHarness, head: Person, approver: Person, budget: TicketBudget): Promise<void> {
  const finance = h.as(h.finance);
  const cycle = await request(h.server()).get(`/api/v1/budget-cycles/${YEAR}`).set(finance);
  if (cycle.status === 404) {
    await request(h.server())
      .post('/api/v1/budget-cycles')
      .set(finance)
      .send({
        year: YEAR,
        submissionDeadline: `${YEAR}-12-15`,
        decisionDeadline: `${YEAR}-12-31`,
        annualCeiling: { amount: '100000000000' },
        sharedPoolReserve: { amount: '0' },
      })
      .expect(201);
    await request(h.server()).post(`/api/v1/budget-cycles/${YEAR}/opening`).set(finance).expect(200);
  } else if (cycle.status !== 200) {
    throw new Error(`Cannot read fixture budget cycle (${cycle.status})`);
  }
  await approvedBudget(h.ctx, {
    headToken: head.account.accessToken,
    financeToken: h.finance.accessToken,
    deciderToken: approver.account.accessToken,
    proposal: { year: YEAR, requestedAmount: { amount: (budget.baseMinor + budget.reserveMinor).toString() } },
    version: {
      base: { amount: budget.baseMinor.toString() },
      reserve: { amount: budget.reserveMinor.toString() },
      reserveReason: 'Fixture reserve for Design',
    },
  });
}

async function ticketPlans(h: RequestHarness): Promise<TicketWorld['plans']> {
  const token = h.it1.accessToken;
  const application = (name: string, kind: 'SAAS' | 'LICENSED' | 'INTERNAL' = 'SAAS') =>
    declareApplication(h.ctx, token, {
      name,
      kind,
      ...(kind === 'INTERNAL' ? {} : { vendorName: name }),
      dataSensitivity: 'LOW',
      communication: NO,
    });
  const paidPlan = (applicationId: string, name: string, provisioningType: 'K1' | 'K2' | 'K4', extra: object = {}) =>
    declarePlan(h.ctx, token, {
      applicationId,
      name,
      provisioningType,
      pricingModel: 'PER_SEAT',
      controlLevel: 'FULL',
      ...extra,
    });
  const workspaceFor = async (applicationId: string): Promise<string> => {
    const headers = h.as(h.it1);
    const { vendor } = h.dataOf<{ vendor: { id: string; name: string } | null }>(
      await request(h.server()).get(`/api/v1/applications/${applicationId}`).set(headers).expect(200),
    );
    if (!vendor) throw new Error(`Fixture application ${applicationId} needs a vendor`);

    return h.dataOf<{ id: string }>(
      await request(h.server())
        .post('/api/v1/workspaces')
        .set(headers)
        .send({ vendorId: vendor.id, name: vendor.name })
        .expect(201),
    ).id;
  };
  const pricedPlan = async (applicationId: string, name: string, amount: string, workspaceId?: string) => {
    const workspace = workspaceId ?? (await workspaceFor(applicationId));
    const planId = await paidPlan(applicationId, name, 'K2');
    await declareSubscription(h.ctx, token, {
      planId,
      workspaceId: workspace,
      kind: 'TERM',
      billingCycle: 'MONTHLY',
      purchasedQuantity: 20,
      unitPrice: { amount, currency: 'VND' },
      startDate: '2026-01-01',
      endDate: '2026-12-31',
    });

    return { planId, workspace };
  };

  const figma = await application('Figma');
  const full = await pricedPlan(figma, 'Org — Full', '600000');
  const dev = await pricedPlan(figma, 'Org — Dev', '400000', full.workspace);
  const miro = await pricedPlan(await application('Miro'), 'Business', '500000');
  const notion = await pricedPlan(await application('Notion'), 'Plus', '300000');
  const slack = await pricedPlan(await application('Slack'), 'Pro', '250000');
  const k1Annual = await paidPlan(await application('Annual seats'), 'Annual', 'K1', {
    referencePrice: { amount: '500000', currency: 'VND' },
    referenceCommitmentMonths: 12,
  });
  const k4DeviceKey = await paidPlan(await application('Device software', 'LICENSED'), 'Device key', 'K4', {
    keyBinding: 'DEVICE_KEY',
  });
  const lot = h.dataOf<{ id: string }>(
    await request(h.server())
      .post('/api/v1/license-lots')
      .set(h.as(h.it1))
      .send({
        planId: k4DeviceKey,
        purpose: 'STOCK',
        licenseCount: 1,
        unitPrice: { amount: '1500000', currency: 'VND' },
        purchasedOn: TODAY,
      })
      .expect(201),
  );
  await request(h.server())
    .post(`/api/v1/license-lots/${lot.id}/keys`)
    .set(h.as(h.it1))
    .send({ keys: ['TICKET-FIXTURE-DEVICE-KEY'], maxActivations: 1 })
    .expect(201);
  const k5Internal = await declarePlan(h.ctx, token, {
    applicationId: await application('Internal tools', 'INTERNAL'),
    name: 'Internal',
    provisioningType: 'K5',
  });

  return {
    figmaFull: full.planId,
    figmaDev: dev.planId,
    miro: miro.planId,
    notion: notion.planId,
    slack: slack.planId,
    k4DeviceKey,
    k1Annual,
    k5Internal,
  };
}
