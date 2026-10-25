import request from 'supertest';
import type { ApiAccount } from './api-accounts';
import type { AccessRequestWire, Person } from './request-harness';
import { SpendHarness, type Unit } from './spend-harness';

/** A request for a service account as the wire carries it: the request, with the detail that is particular to it. */
export interface ServiceRequestWire extends Omit<AccessRequestWire, 'state'> {
  state: string;
  serviceAccount: {
    purpose: string;
    expectedIdentifier: string;
    responsible: { employeeId: string };
    boundary: {
      state: 'PENDING' | 'ACCEPTED' | 'REJECTED';
      reason: string | null;
      decidedBy: { employeeId: string } | null;
      decidedAt: string | null;
      selfExecuted: boolean;
    };
  } | null;
}

/**
 * The spend harness with the calls of the request for a service account, which is the request of a plan with a purpose and an
 * identifier to expect, and the steps that take it to the boundary the IT Admin decides. No assertion lives here.
 */
export class ServiceAccountHarness extends SpendHarness {
  submitService = (body: object, account: ApiAccount) =>
    request(this.server()).post('/api/v1/access-requests/service-accounts').set(this.as(account)).send(body);
  reviewService = (id: string, body: object, account: ApiAccount = this.it1) =>
    request(this.server())
      .post(`/api/v1/access-requests/${id}/service-account-review`)
      .set(this.as(account))
      .send(body);

  /** A complete form for the plan; `extra` overrides a field. */
  serviceForm = (planId: string, extra: Record<string, unknown> = {}) => ({
    planId,
    purpose: 'Build bot of the CI pipeline',
    expectedIdentifier: 'ci-bot-2',
    businessReason: 'Run the builds of the product',
    termMonths: 1,
    ...extra,
  });

  /** Sends the request and returns it, failing on anything but 201. */
  async sentService(person: Person, planId: string, extra: Record<string, unknown> = {}): Promise<ServiceRequestWire> {
    const response = await this.submitService(this.serviceForm(planId, extra), person.account);
    if (response.status !== 201) throw new Error(`submit: ${response.status} ${JSON.stringify(response.body)}`);

    return this.dataOf<{ request: ServiceRequestWire }>(response).request;
  }

  /**
   * A request for a service account that costs money, approved by the head of the unit (outside the plan of the budget) and by
   * the spending approver, so that it waits to be carried out: its commitment is held in the Unit Cost Center.
   */
  async approvedService(unit: Unit, person: Person, planId: string, amount: number): Promise<string> {
    const sent = await this.sentService(person, planId);
    await this.decide(sent.id, { decision: 'APPROVE', spend: { offPlan: true } }, unit.head.account).expect(200);
    await this.setPayments(sent.id, { amount });
    await this.sendOn([sent.id], unit.head.account).expect(201);
    await this.decideSpend(sent.id, { decision: 'APPROVE' }, this.boss.account).expect(200);

    return sent.id;
  }

  /** A request for a service account of internal software: only the head decides it, then it waits to be carried out. */
  async approvedInternalService(unit: Unit, person: Person, planId: string): Promise<string> {
    const sent = await this.sentService(person, planId);
    await this.decide(sent.id, { decision: 'APPROVE' }, unit.head.account).expect(200);

    return sent.id;
  }

  async fetchService(id: string, account: ApiAccount): Promise<ServiceRequestWire> {
    return this.dataOf<{ request: ServiceRequestWire }>(await this.fetch(id, account).expect(200)).request;
  }
}
