import type { AssessmentWire } from '../../src/modules/requests/assessment/assessment.dto';
import type { PreviewWire } from '../../src/modules/requests/request-submission/request-preview.dto';
import request from 'supertest';
import { ApiAccount } from './api-accounts';
import { declareSubscription } from './builders/catalog.builder';
import { clearSpendingApprover, insertEmployeeWithoutPlacement, setSpendingApprover } from './builders/account.builder';
import { assignHead } from './builders/organization.builder';
import { OwnedSubscriptions } from './owned-subscriptions';
import { ProvisioningHarness } from './provisioning-harness';
import { SeatHarness } from './seat-baseline-harness';

export interface EmployeeRefWire {
  employeeId: string;
  employeeCode: string;
  fullName: string;
}

export interface AccessRequestWire {
  id: string;
  type: string;
  branch: 'INTERNAL_FREE' | 'PAID_IN_CATALOG' | 'NEW_SOFTWARE';
  state:
    | 'PENDING'
    | 'WAITING_CONTROLLED'
    | 'AWAITING_EXECUTION'
    | 'AWAITING_IT_ASSESSMENT'
    | 'AWAITING_SPEND_SUBMISSION'
    | 'AWAITING_FINANCE_REVIEW'
    | 'AWAITING_BUDGET'
    | 'AWAITING_SPEND_DECISION'
    | 'REJECTED'
    | 'IT_REJECTED'
    | 'EXECUTING'
    | 'COMPLETED'
    | 'FAILED';
  plan: { planId: string; planName: string; applicationId: string; applicationName: string } | null;
  proposal: {
    softwareName: string;
    homepageUrl: string;
    purpose: string;
    dataDescription: string;
    expectedUsers: number;
  } | null;
  department: { id: string; code: string; name: string };
  costCenter: { id: string; code: string };
  requester: EmployeeRefWire;
  beneficiary: EmployeeRefWire;
  businessReason: string;
  termMonths: number;
  expectedSpendOn: string | null;
  budgetYear: number | null;
  pricing: {
    status: 'NOT_APPLICABLE' | 'PRICED' | 'MISSING';
    missingReason: 'NO_PRICED_SUBSCRIPTION' | 'CYCLE_UNKNOWN' | 'AMOUNT_TOO_LARGE' | 'AWAITING_QUOTE' | null;
    amount: { amount: string; currency: string } | null;
    unitPrice: { amount: string; currency: string } | null;
    billingCycle: 'MONTHLY' | 'QUARTERLY' | 'ANNUAL' | 'OTHER' | null;
    periodCount: number | null;
    bindingPeriodCount: number | null;
    firstDueOn: string | null;
    lastDueOn: string | null;
  };
  policy: { version: number; hasSpendStep: boolean; slaWorkingDays: number };
  submittedAt: string;
  needDecision: {
    decision: 'APPROVED' | 'REJECTED';
    decidedBy: EmployeeRefWire;
    deciderRole: string;
    reason: string | null;
    termConfirmationReason: string | null;
    decidedAt: string;
  } | null;
  needStep: {
    id: string;
    state: 'PENDING' | 'WAITING' | 'APPROVED' | 'REJECTED';
    assignee: EmployeeRefWire | null;
    routingRow: number;
    waitingReason: string | null;
    samePersonAsSpend: boolean;
    slaWorkingDays: number;
    createdAt: string;
    assignedAt: string | null;
    decidedAt: string | null;
  };
}

export interface Person {
  employeeId: string;
  account: ApiAccount;
}

/** A department of the organization with the people the routing table talks about, made through the real services. */
export interface Department {
  id: string;
  code: string;
  unitId: string;
}

/**
 * The provisioning harness with what the requests of G5 need: departments with a head, people with an account, the
 * approval roles, and the calls of the request routes. No assertion lives here: the specs make them.
 */
export class RequestHarness extends ProvisioningHarness {
  private titleName: string | null = null;

  /** A request is priced, and a seat taken, by the subscription of its own department (F38, F20): see owned-subscriptions.ts. */
  readonly owned = new OwnedSubscriptions((body) => declareSubscription(this.ctx, this.it1.accessToken, body));

  constructor() {
    super();
    // A grant of a request made through the harness is made on the subscription its department owns.
    const grantOnSeeded = this.grant;
    this.grant = (body: object, account?: ApiAccount) => grantOnSeeded(this.owned.grantBody(body), account);
  }

  override async subscription(
    quantity: number | null = 100,
    type: 'K1' | 'K2' | 'K4' = 'K2',
    ownerDepartmentId: string = this.seed.departmentId,
  ): Promise<string> {
    const id = await super.subscription(quantity, type, ownerDepartmentId);
    if (ownerDepartmentId === this.seed.departmentId) await this.owned.recordSeed(id, await this.planOf(id), quantity);

    return id;
  }

  /** Starts the application with the real gate of the module of requests: the fake gate of the provisioning harness is not used. */
  override start(options: Parameters<SeatHarness['start']>[0] = {}): Promise<void> {
    return SeatHarness.prototype.start.call(this, options);
  }

  /** One job title (free text) for everybody a spec makes. */
  async title(): Promise<string> {
    this.titleName ??= await this.jobTitle(this.unique('Title'));

    return this.titleName;
  }

  /** A department with its own Unit Cost Center, and a subscription of every plan the seeded department holds. */
  async departmentWithUnit(code: string): Promise<Department> {
    const created = await this.department(code);
    await this.owned.give(created.id);
    // The Cost Center Finance created for the department, read through its own link (`QĐ-87d(1)`).
    const { rows } = await this.ctx.sql.query<{ id: string }>(
      `SELECT id FROM cost_centers WHERE department_id = $1 AND status = 'ACTIVE'`,
      [created.id],
    );

    return { id: created.id, code: created.code, unitId: rows[0].id };
  }

  /** A person of the department with an activated account holding `roles`; a head or an approver is made one by the calls below. */
  async staff(department: Department, code: string, role = 'EMPLOYEE'): Promise<Person> {
    const employeeId = await this.member(department.code, code, await this.title());

    return { employeeId, account: await this.account(code, employeeId, role) };
  }

  async unplacedStaff(code: string, role = 'EMPLOYEE'): Promise<Person> {
    const employeeId = await insertEmployeeWithoutPlacement(this.ctx, this.seed, {
      code,
      email: `${code.toLowerCase()}@acme.vn`,
    });

    return { employeeId, account: await this.account(code, employeeId, role) };
  }

  /**
   * Makes the person the head of the department from today (as the Super Admin does: the IT Admin has no right to, `QĐ-87`),
   * through the service of the route (T2.2: no HTTP).
   */
  async makeHead(department: Department, person: Person): Promise<void> {
    await assignHead(this.ctx, this.admin, department.id, {
      employeeId: person.employeeId,
      effectiveFrom: this.today(),
    });
  }

  /** The Super Admin grants the role of the spending approver, through the service of the route (T2.2: no HTTP). */
  async setRole(role: 'SPENDING_APPROVER', person: Person): Promise<void> {
    if (role !== 'SPENDING_APPROVER')
      throw new Error(`${String(role)} is not a role a test can set any more (QĐ-93c).`);
    await setSpendingApprover(this.ctx, this.admin, person.employeeId);
  }

  /** Nobody holds the role of the spending approver any more: the Super Admin revokes it, through the service of the route. */
  async clearRole(role: 'SPENDING_APPROVER'): Promise<void> {
    if (role !== 'SPENDING_APPROVER')
      throw new Error(`${String(role)} is not a role a test can clear any more (QĐ-93c).`);
    await clearSpendingApprover(this.ctx, this.admin);
  }

  submit = (body: object, account: ApiAccount) =>
    request(this.server()).post('/api/v1/access-requests').set(this.as(account)).send(body);
  /** The requests made through `sent` and `proposed` that cost money: a head approving one chooses a line of the plan (US-05-04 AC-12). */
  private readonly costing = new Set<string>();

  private remember(wire: AccessRequestWire): AccessRequestWire {
    // Only a head who holds the need step (row 1 of the routing table) chooses a line; the others have none to choose.
    if (wire.policy.hasSpendStep && wire.needStep.routingRow === 1) this.costing.add(wire.id);
    this.owned.noteRequest(wire.id, wire.department.id);

    return wire;
  }

  /**
   * The decision of the need step. A head approving a request that costs money must choose a line of the plan or say it is
   * outside it, so an approval of such a request that says nothing of it is sent as "outside the plan"; a test that is about
   * the choice gives `spend` itself (`spend: undefined` sends none).
   */
  decide = (id: string, body: object, account: ApiAccount) => {
    const payload = body as { decision?: string };
    const given = 'spend' in payload;
    const sent =
      payload.decision === 'APPROVE' && !given && this.costing.has(id)
        ? { ...payload, spend: { offPlan: true } }
        : body;

    return request(this.server()).post(`/api/v1/access-requests/${id}/need-decision`).set(this.as(account)).send(sent);
  };
  fetch = (id: string, account: ApiAccount) =>
    request(this.server()).get(`/api/v1/access-requests/${id}`).set(this.as(account));

  previewRequest = (body: object, account: ApiAccount) =>
    request(this.server()).post('/api/v1/access-requests/preview').set(this.as(account)).send(body);

  /** The preview of a request for the plan, failing on anything but 200. */
  async previewed(person: Person, planId: string, extra: Record<string, unknown> = {}): Promise<PreviewWire> {
    const response = await this.previewRequest({ planId, termMonths: 6, ...extra }, person.account);
    if (response.status !== 200) throw new Error(`preview: ${response.status} ${JSON.stringify(response.body)}`);

    return this.dataOf<{ preview: PreviewWire }>(response).preview;
  }

  /** The software is not in the catalog: the proposal of a person, with what they declare and the term. */
  proposeBody = (extra: Record<string, unknown> = {}) => ({
    softwareName: 'Miro',
    homepageUrl: 'https://miro.com',
    purpose: 'Whiteboards for design reviews',
    dataDescription: 'Product design boards',
    expectedUsers: 5,
    termMonths: 6,
    ...extra,
  });
  propose = (body: object, account: ApiAccount) =>
    request(this.server()).post('/api/v1/access-requests/proposals').set(this.as(account)).send(body);

  /** Sends the proposal and returns the request, failing on anything but 201. */
  async proposed(person: Person, extra: Record<string, unknown> = {}): Promise<AccessRequestWire> {
    const response = await this.propose(this.proposeBody(extra), person.account);
    if (response.status !== 201) throw new Error(`propose: ${response.status} ${JSON.stringify(response.body)}`);

    return this.remember(this.dataOf<{ request: AccessRequestWire }>(response).request);
  }

  assessmentOf = (id: string, account: ApiAccount) =>
    request(this.server()).get(`/api/v1/access-requests/${id}/assessment`).set(this.as(account));
  saveAssessment = (id: string, body: object, account: ApiAccount) =>
    request(this.server()).put(`/api/v1/access-requests/${id}/assessment`).set(this.as(account)).send(body);
  completeAssessment = (id: string, account: ApiAccount) =>
    request(this.server()).post(`/api/v1/access-requests/${id}/assessment/completion`).set(this.as(account));
  rejectAssessment = (id: string, body: object, account: ApiAccount) =>
    request(this.server()).post(`/api/v1/access-requests/${id}/assessment/rejection`).set(this.as(account)).send(body);
  registerInternal = (id: string, body: object, account: ApiAccount) =>
    request(this.server()).post(`/api/v1/access-requests/${id}/internal-registration`).set(this.as(account)).send(body);
  linkPlan = (id: string, planId: string, account: ApiAccount) =>
    request(this.server()).post(`/api/v1/access-requests/${id}/catalog-link`).set(this.as(account)).send({ planId });

  async assessmentWire(id: string, account: ApiAccount): Promise<AssessmentWire> {
    return this.dataOf<{ assessment: AssessmentWire }>(await this.assessmentOf(id, account).expect(200)).assessment;
  }

  /** The minimum of the assessment of paid software, with a quote, as the IT Admin gives it; `extra` overrides a field. */
  assessmentBody = (extra: Record<string, unknown> = {}) => ({
    classification: 'PAID_LICENSED',
    vendorName: 'Miro Inc.',
    plannedPlanName: 'Business',
    provisioningType: 'K2',
    adminConsole: true,
    memberExport: true,
    sso: false,
    termsSummary: 'Annual terms, sharing not allowed',
    memberUsageMethod: 'Export of members from the admin console',
    grantRevokeMethod: 'Invite and remove by work email',
    dataSensitivity: 'MEDIUM',
    controlLevel: 'PARTIAL',
    controlRiskNote: 'No export of usage',
    quote: {
      unitPrice: { amount: '8.00', currency: 'USD' },
      billingCycle: 'MONTHLY',
      validFrom: '2026-01-01',
      validUntil: null,
      commitmentMonths: 6,
      paymentFrequency: 'MONTHLY',
    },
    ...extra,
  });

  /** The IT Admin in charge of the department, as the organization names them (`US-01-11`). */
  async setItAdminInCharge(department: Department, person: Person): Promise<void> {
    await this.ctx.sql.query(`UPDATE departments SET it_admin_employee_id = $2 WHERE id = $1`, [
      department.id,
      person.employeeId,
    ]);
  }

  /** The vendor of the application of a plan: whose tax profile estimates its price. */
  async vendorOf(planId: string): Promise<{ id: string; name: string }> {
    const { rows } = await this.ctx.sql.query<{ id: string; name: string }>(
      `SELECT v.id, v.name FROM plans p JOIN applications a ON a.id = p.application_id JOIN vendors v ON v.id = a.vendor_id WHERE p.id = $1`,
      [planId],
    );

    return rows[0];
  }

  /** Finance declares the tax profile of a vendor. */
  declareTaxProfile = (vendorId: string, lines: Array<{ taxType: string; ratePercent: string; deductible: boolean }>) =>
    request(this.server())
      .put(`/api/v1/vendors/${vendorId}/tax-profile`)
      .set(this.as(this.finance))
      .send({ group: 'T2', lines });

  /** A form of `BM-01` for the plan, complete. */
  form = (planId: string, extra: Record<string, unknown> = {}) => ({
    planId,
    businessReason: 'Design the new brand',
    termMonths: 6,
    ...extra,
  });

  /** Sends the request and returns it, failing on anything but 201. */
  async sent(person: Person, planId: string, extra: Record<string, unknown> = {}): Promise<AccessRequestWire> {
    const response = await this.submit(this.form(planId, extra), person.account);
    if (response.status !== 201) throw new Error(`submit: ${response.status} ${JSON.stringify(response.body)}`);

    return this.remember(this.dataOf<{ request: AccessRequestWire }>(response).request);
  }

  /** The plans' applications share one functional group, made now. */
  async groupTogether(planIds: string[]): Promise<void> {
    const made = this.dataOf<{ id?: string; group?: { id: string } }>(
      await request(this.server())
        .post('/api/v1/functional-groups')
        .set(this.as(this.it1))
        .send({ name: this.unique('Group') })
        .expect(201),
    );
    const groupId = made.id ?? made.group?.id;
    for (const planId of planIds) {
      const { rows } = await this.ctx.sql.query<{ application_id: string }>(
        `SELECT application_id FROM plans WHERE id = $1`,
        [planId],
      );
      await request(this.server())
        .patch(`/api/v1/applications/${rows[0].application_id}`)
        .set(this.as(this.it1))
        .send({ functionalGroupId: groupId })
        .expect(200);
    }
  }

  /** The plans' applications join the functional group the anchor plan's application is in. */
  async joinGroupOf(anchorPlanId: string, planIds: string[]): Promise<void> {
    const { rows } = await this.ctx.sql.query<{ functional_group_id: string }>(
      `SELECT a.functional_group_id FROM plans p JOIN applications a ON a.id = p.application_id WHERE p.id = $1`,
      [anchorPlanId],
    );
    for (const planId of planIds) {
      const app = await this.ctx.sql.query<{ application_id: string }>(
        `SELECT application_id FROM plans WHERE id = $1`,
        [planId],
      );
      await request(this.server())
        .patch(`/api/v1/applications/${app.rows[0].application_id}`)
        .set(this.as(this.it1))
        .send({ functionalGroupId: rows[0].functional_group_id })
        .expect(200);
    }
  }

  /** The person (by employee code) holds a seat of the internal plan, as a baseline records it. */
  async hold(employeeCode: string, planId: string): Promise<void> {
    await this.written({ planId }, [
      { employee_code: employeeCode, account_identifier: `${employeeCode.toLowerCase()}@acme.vn` },
    ]);
  }

  async requestRows(): Promise<number> {
    return this.count('access_requests');
  }
}
