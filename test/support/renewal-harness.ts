import request from 'supertest';
import { TransactionRunner } from '../../src/infrastructure/database/transaction-runner';
import { LicensingApi } from '../../src/modules/licensing/public/licensing.api';
import { SubscriptionRenewalRepo } from '../../src/modules/licensing/subscription-renewal/subscription-renewal.repo';
import type { DeciderRole } from '../../src/modules/licensing/subscription-renewal/subscription-renewal.types';
import { SubscriptionRenewalSweepService } from '../../src/modules/licensing/subscription-renewal/subscription-renewal-sweep.service';
import type { ApiAccount } from './api-accounts';
import { declareApplication, declarePlan, declareSubscription } from './builders/catalog.builder';
import { ExpiryHarness } from './expiry-harness';
import type { Department, Person } from './request-harness';

/** The term of a subscription a test declares; anything not named is left out (no deadline, no auto renewal...). */
export interface TermOptions {
  quantity?: number;
  ownerDepartmentId?: string;
  unitPrice?: string;
  currency?: string;
  billingCycle?: 'MONTHLY' | 'QUARTERLY' | 'ANNUAL' | 'OTHER';
  startDate?: string;
  endDate?: string;
  renewalDate?: string;
  noticeDeadline?: string;
  noticePeriodDays?: number;
  autoRenew?: boolean;
  allowsMidTermReduction?: boolean;
  type?: 'K1' | 'K2' | 'K4';
}

export interface NoticeRow {
  recipient_employee_id: string;
  code: string;
  subject_id: string | null;
  params: Record<string, unknown>;
  event_key: string;
}

/** The unit of a renewal test: a department with its Cost Center, a head and members who hold seats, and its IT Admin. */
export interface RenewalUnit {
  department: Department;
  head: Person;
  members: Person[];
}

/**
 * The expiry harness with what the tests of the renewal of a subscription need: term subscriptions with a milestone, a unit whose
 * people hold seats on them, the routes of the renewals, the hourly pass run by hand as if it were a given day, and the rows the
 * database keeps (notices, cases, events). No assertion lives here.
 */
export class RenewalHarness extends ExpiryHarness {
  private units = 0;

  renewals = (query = '', account: ApiAccount = this.it1) =>
    request(this.server()).get(`/api/v1/subscription-renewals${query}`).set(this.as(account));
  read = (id: string, account: ApiAccount = this.it1) =>
    request(this.server()).get(`/api/v1/subscription-renewals/${id}`).set(this.as(account));
  ranking = (id: string, account: ApiAccount = this.it1, query = '') =>
    request(this.server()).get(`/api/v1/subscription-renewals/${id}/seat-ranking${query}`).set(this.as(account));
  /** The one write of the result at the point of adjustment (`SBF-20` §4.4): the case, its decision and its outcome in one transaction. */
  propose = (body: object, account: ApiAccount = this.it1) =>
    request(this.server()).post('/api/v1/subscription-renewals').set(this.as(account)).send(body);
  /** The adjustment of a subscription as the IT Admin or Finance reads it before recording (`GET /subscription-renewals/adjustment`). */
  adjustment = (subscriptionId: string, account: ApiAccount = this.it1) =>
    request(this.server())
      .get(`/api/v1/subscription-renewals/adjustment?subscriptionId=${subscriptionId}`)
      .set(this.as(account));
  /** The outcome of a case DECIDED before the one-write rule (legacy route): nothing else is recorded this way. */
  outcome = (id: string, body: object, account: ApiAccount = this.it1) =>
    request(this.server()).post(`/api/v1/subscription-renewals/${id}/outcome`).set(this.as(account)).send(body);
  deadlineEvents = (query = '', account: ApiAccount = this.it1) =>
    request(this.server()).get(`/api/v1/subscription-deadline-events${query}`).set(this.as(account));

  /** The hourly pass, run by hand as if it were noon (UTC+7 morning) of `day`. */
  sweepOn = (day: string) =>
    this.ctx.app.get(SubscriptionRenewalSweepService, { strict: false }).sweep(new Date(`${day}T05:00:00.000Z`));

  /** A department with its Cost Center, a head, `members` people, and IT1 named as its IT Admin. */
  async unit(members = 1): Promise<RenewalUnit> {
    this.units += 1;
    const code = `P-RN${this.units}`;
    const department = await this.departmentWithUnit(code);
    const head = await this.staff(department, `${code}-H`);
    await this.makeHead(department, head);
    const people: Person[] = [];
    for (let index = 0; index < members; index += 1) people.push(await this.staff(department, `${code}-E${index}`));
    await this.setItAdminInCharge(department, { employeeId: this.it1.employeeId, account: this.it1 });

    return { department, head, members: people };
  }

  /** A complete term subscription of a new plan owned by the department, declared by the IT Admin. */
  async term(options: TermOptions = {}): Promise<string> {
    const planId = await this.plan(options.type ?? 'K2', 'PER_SEAT');

    return declareSubscription(this.ctx, this.it1.accessToken, {
      ownerDepartmentId: options.ownerDepartmentId ?? this.seed.departmentId,
      planId,
      kind: 'TERM',
      purchasedQuantity: options.quantity ?? 10,
      unitPrice: { amount: options.unitPrice ?? '1000000', currency: options.currency ?? 'VND' },
      billingCycle: options.billingCycle ?? 'ANNUAL',
      startDate: options.startDate ?? '2026-01-01',
      ...(options.endDate ? { endDate: options.endDate } : {}),
      ...(options.renewalDate ? { renewalDate: options.renewalDate } : {}),
      ...(options.noticeDeadline ? { noticeDeadline: options.noticeDeadline } : {}),
      ...(options.noticePeriodDays !== undefined ? { noticePeriodDays: options.noticePeriodDays } : {}),
      autoRenew: options.autoRenew ?? false,
      allowsMidTermReduction: options.allowsMidTermReduction ?? false,
    });
  }

  /** A perpetual purchase of licensed software (no term, no milestone: `QĐ-49c`). */
  async perpetual(): Promise<string> {
    const applicationId = await declareApplication(this.ctx, this.it1.accessToken, {
      name: this.unique('Licensed'),
      kind: 'LICENSED',
      vendorName: this.unique('Vendor'),
      dataSensitivity: 'LOW',
      communication: { personToPersonMessaging: false, callsOrMeetings: false, mailbox: false },
    });
    const planId = await declarePlan(this.ctx, this.it1.accessToken, {
      applicationId,
      name: this.unique('Plan'),
      provisioningType: 'K1',
      pricingModel: 'PER_SEAT',
      controlLevel: 'FULL',
    });

    return declareSubscription(this.ctx, this.it1.accessToken, {
      ownerDepartmentId: this.seed.departmentId,
      planId,
      kind: 'PERPETUAL',
      purchasedQuantity: 5,
      unitPrice: { amount: '1000000', currency: 'VND' },
      startDate: this.inDays(-100),
    });
  }

  /** A term subscription of the unit with a declared deadline `deadlineInDays` from today and its people holding a seat each. */
  async termWithSeats(
    unit: RenewalUnit,
    deadlineInDays: number,
    options: TermOptions = {},
  ): Promise<{ subscriptionId: string; seats: string[] }> {
    const subscriptionId = await this.term({
      endDate: this.inDays(deadlineInDays + 30),
      noticeDeadline: this.inDays(deadlineInDays),
      ...options,
      ownerDepartmentId: unit.department.id,
    });
    const seats: string[] = [];
    for (const member of unit.members) seats.push(await this.seatOf(member, { subscriptionId }));

    return { subscriptionId, seats };
  }

  /** Records the result as the IT Admin (or `account`), failing on anything but 201; returns the id of the case and of the new period, if any. */
  async recordedRenewal(
    body: object,
    account: ApiAccount = this.it1,
  ): Promise<{ id: string; nextSubscriptionId: string | null }> {
    const response = await this.propose(body, account);
    if (response.status !== 201) throw new Error(`record: ${response.status} ${JSON.stringify(response.body)}`);
    const renewal = this.dataOf<{
      renewal: { id: string; outcomeDetail: { nextSubscriptionId: string | null } | null };
    }>(response).renewal;

    return { id: renewal.id, nextSubscriptionId: renewal.outcomeDetail?.nextSubscriptionId ?? null };
  }

  /**
   * A case as it stood before the one-write rule: proposed by the IT Admin and decided by `decidedBy` (a head), waiting for its outcome
   * (state `DECIDED`). Written through the repository, as the old routes did; only `POST /{id}/outcome` still records it.
   */
  async legacyDecidedRenewal(
    subscriptionId: string,
    options: { choice: 'RENEW' | 'REDUCE' | 'CANCEL'; quantity?: number; decidedBy: Person; role?: DeciderRole },
  ): Promise<string> {
    const repo = this.ctx.app.get(SubscriptionRenewalRepo, { strict: false });

    return this.ctx.app.get(TransactionRunner).run(async (tx) => {
      const proposed = await repo.insert(tx, {
        organizationId: this.seed.organizationId,
        subscriptionId,
        noticeBasis: 'DECLARED',
        noticeBaseDate: this.inDays(60),
        proposedChoice: options.choice,
        proposedQuantity: options.quantity ?? null,
        proposalNote: null,
        seatsNeeded: null,
        proposedByEmployeeId: this.it1.employeeId,
        proposedByAppUserId: this.it1.appUserId,
      });
      if (!proposed) throw new Error('the legacy case was not written');
      await repo.recordDecision(tx, proposed.id, {
        choice: options.choice,
        quantity: options.quantity ?? null,
        reason: null,
        decidedByEmployeeId: options.decidedBy.employeeId,
        decidedByAppUserId: options.decidedBy.account.appUserId,
        deciderRole: options.role ?? 'OWNER_DEPARTMENT_HEAD',
        decidedAt: new Date(),
        decidedOn: this.inDays(0),
        decidedAfterDeadline: false,
        executionPoint: 'AS_PLANNED',
        activeSeatsAtDecision: 0,
        snapshot: { source: 'NOT_CONNECTED', takenAt: new Date().toISOString() },
      });

      return proposed.id;
    });
  }

  /** What a source module does: opens the revocation of a seat (the seat stays held until the task completes). */
  openRevocation(assignmentId: string) {
    return this.ctx.app.get(TransactionRunner).run((tx) =>
      this.ctx.app.get(LicensingApi).openRevocation(tx, this.principal(this.it1, ['IT_ADMIN']), {
        assignmentId,
        source: 'RETURN',
        decision: { decidedRole: 'MANAGER' },
      }),
    );
  }

  /** The notices of a code about a subject (a subscription or a case), oldest first. */
  async notices(code: string, subjectId: string): Promise<NoticeRow[]> {
    const { rows } = await this.ctx.sql.query<NoticeRow>(
      `SELECT recipient_employee_id, code, subject_id, params, event_key
         FROM in_app_notifications WHERE code = $1 AND subject_id = $2 ORDER BY created_at, id`,
      [code, subjectId],
    );

    return rows;
  }

  /** The row of a case as the database keeps it. */
  async caseRow(id: string): Promise<Record<string, unknown>> {
    const { rows } = await this.ctx.sql.query<Record<string, unknown>>(
      `SELECT state::text, decided_choice::text, execution_point::text, decided_after_deadline, decider_role,
              late_flagged_at, outcome::text, vendor_follow_up_open, next_subscription_id,
              realised_savings_minor::text AS realised_savings_minor, decision_snapshot
         FROM subscription_renewals WHERE id = $1`,
      [id],
    );

    return rows[0];
  }

  /** The reasons of the live revocation of each seat: source and the reference of the decision. */
  async revocationReasons(
    assignmentIds: readonly string[],
  ): Promise<{ assignment_id: string; source: string; reference_id: string | null }[]> {
    const { rows } = await this.ctx.sql.query<{ assignment_id: string; source: string; reference_id: string | null }>(
      `SELECT t.assignment_id, r.source::text AS source, r.reference_id
         FROM provisioning_tasks t JOIN provisioning_task_reasons r ON r.task_id = t.id
        WHERE t.kind = 'REVOKE' AND t.assignment_id = ANY($1::uuid[])
        ORDER BY t.assignment_id, r.created_at`,
      [assignmentIds],
    );

    return rows;
  }

  /** The person left the company (the status the offboarding writes); their seats stay until revoked. */
  async left(person: Person): Promise<void> {
    await this.ctx.sql.query(`UPDATE employees SET status = 'TERMINATED' WHERE id = $1`, [person.employeeId]);
  }
}
