import request from 'supertest';
import { ServiceAccountDutyService } from '../../src/modules/licensing/assignment/service-account-duty.service';
import { OrganizationService } from '../../src/modules/organization/organization.service';
import type { ApiAccount } from './api-accounts';
import { OffboardingHarness } from './offboarding-harness';
import type { Department, Person } from './request-harness';
import type { AssignmentWire } from './seat-baseline-harness';

export interface DutyWire {
  assignmentId: string;
  accountIdentifier: string;
  plan: { planId: string; planName: string; applicationName: string };
  owningDepartment: { id: string; code: string; name: string } | null;
  responsible: { employeeId: string; employeeCode: string; fullName: string };
  dueOn: string;
  fileKind: 'TRANSFER' | 'OFFBOARDING';
  fileId: string;
  overdue: boolean;
}

export interface MoveWire {
  id: string;
  status: 'PENDING' | 'CONFIRMED' | 'CANCELLED';
  assignmentId: string;
  accountIdentifier: string;
  currentResponsible: { employeeId: string };
  fromDepartment: { id: string; code: string };
  toDepartment: { id: string; code: string };
  newResponsible: { employeeId: string };
  effectiveFrom: string;
  expectedEndDate: string | null;
  confirmation: { confirmedByEmployeeId: string; role: string; confirmedAt: string } | null;
  cancellation: { cancelledByAppUserId: string; reason: string } | null;
  resultingAssignmentId: string | null;
}

export interface AssignmentRow {
  id: string;
  employee_id: string;
  owning_department_id: string | null;
  cost_center_id: string | null;
  valid_from: string;
  valid_until: string | null;
  predecessor_id: string | null;
  source: string;
}

/**
 * The offboarding harness with what the tests of the handover of service accounts need: a service account written through the
 * baseline import, the calls of the six routes and the reading of the assignments, the moves and the seats taken as the database keeps
 * them. No assertion lives here.
 */
export class ServiceAccountHandoverHarness extends OffboardingHarness {
  changeResponsibleOf = (id: string, body: object, account: ApiAccount = this.it1) =>
    request(this.server())
      .post(`/api/v1/license-assignments/${id}/responsible-changes`)
      .set(this.as(account))
      .send(body);
  proposeMove = (id: string, body: object, account: ApiAccount = this.it1) =>
    request(this.server()).post(`/api/v1/license-assignments/${id}/department-moves`).set(this.as(account)).send(body);
  confirmMove = (id: string, account: ApiAccount) =>
    request(this.server()).post(`/api/v1/service-account-moves/${id}/confirmations`).set(this.as(account));
  cancelMove = (id: string, body: object, account: ApiAccount = this.it1) =>
    request(this.server()).post(`/api/v1/service-account-moves/${id}/cancellation`).set(this.as(account)).send(body);
  listMoves = (query = '', account: ApiAccount = this.it1) =>
    request(this.server()).get(`/api/v1/service-account-moves${query}`).set(this.as(account));
  listServiceDuties = (query = '', account: ApiAccount = this.it1) =>
    request(this.server()).get(`/api/v1/service-account-duties${query}`).set(this.as(account));
  closeTransfer = (id: string, account: ApiAccount = this.it1) =>
    request(this.server()).post(`/api/v1/department-transfers/${id}/closure`).set(this.as(account));

  /** A service account of the person on the subscription, from long ago, written by the baseline import; returns its assignment. */
  async botOf(person: Person, subscriptionId: string, identifier: string, code: string): Promise<string> {
    await this.ctx.sql.query(`UPDATE employees SET hire_date = '2020-01-01' WHERE id = $1`, [person.employeeId]);
    await this.written({ subscriptionId }, [
      {
        employee_code: code,
        account_identifier: identifier,
        kind: 'service',
        reason: 'CI pipeline',
        granted_on: '2026-01-05',
      },
    ]);
    const found = (await this.assignmentsOf({ subscriptionId, kind: 'SERVICE' })).find(
      (assignment: AssignmentWire) => assignment.accountIdentifier === identifier,
    );
    if (!found) throw new Error(`no service account ${identifier}`);

    return found.id;
  }

  /** The rows of the chain that starts at the assignment, oldest first, as the database keeps them. */
  async chainOf(assignmentId: string): Promise<AssignmentRow[]> {
    const { rows } = await this.ctx.sql.query<AssignmentRow>(
      `WITH RECURSIVE chain AS (
         SELECT * FROM license_assignments WHERE id = $1
         UNION ALL
         SELECT a.* FROM license_assignments a JOIN chain c ON a.predecessor_id = c.id
       )
       SELECT id, employee_id, owning_department_id, cost_center_id, to_char(valid_from, 'YYYY-MM-DD') AS valid_from,
              to_char(valid_until, 'YYYY-MM-DD') AS valid_until, predecessor_id, source::text AS source
         FROM chain ORDER BY valid_from, id`,
      [assignmentId],
    );

    return rows;
  }

  /** How many assignments of the subscription hold a seat on `day`. */
  async seatsTaken(subscriptionId: string, day: string): Promise<number> {
    const { rows } = await this.ctx.sql.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM license_assignments
        WHERE subscription_id = $1 AND valid_from <= $2::date AND (valid_until IS NULL OR valid_until > $2::date)`,
      [subscriptionId, day],
    );

    return rows[0].n;
  }

  /** The Cost Center of the Unit of the department. */
  async unitOf(department: Department): Promise<string> {
    const { rows } = await this.ctx.sql.query<{ cost_center_id: string }>(
      `SELECT cost_center_id FROM departments WHERE id = $1`,
      [department.id],
    );

    return rows[0].cost_center_id;
  }

  async moveRow(id: string): Promise<{
    status: string;
    resulting_assignment_id: string | null;
    confirmed_by_role: string | null;
    confirmed_by_employee_id: string | null;
  }> {
    const { rows } = await this.ctx.sql.query<{
      status: string;
      resulting_assignment_id: string | null;
      confirmed_by_role: string | null;
      confirmed_by_employee_id: string | null;
    }>(
      `SELECT status::text AS status, resulting_assignment_id, confirmed_by_role::text AS confirmed_by_role, confirmed_by_employee_id
         FROM service_account_moves WHERE id = $1`,
      [id],
    );

    return rows[0];
  }

  async noticeCount(assignmentId: string): Promise<number> {
    const { rows } = await this.ctx.sql.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM service_account_duty_notices WHERE assignment_id = $1`,
      [assignmentId],
    );

    return rows[0].n;
  }

  /** The sweep of the overdue reminders, run by hand as if it were `now`. */
  sweepOverdue = (now: Date): Promise<number> =>
    this.ctx.app.get(ServiceAccountDutyService, { strict: false }).noticeOverdue(now);

  /** The organization says today is `day` until the returned function is called; the dates the data was written for stay as they are. */
  pretendToday(day: string): () => void {
    const spy = jest.spyOn(this.ctx.app.get(OrganizationService, { strict: false }), 'businessToday');
    spy.mockResolvedValue(day);

    return () => spy.mockRestore();
  }

  async serviceDuties(query = '', account: ApiAccount = this.it1): Promise<DutyWire[]> {
    return this.dataOf<{ items: DutyWire[] }>(await this.listServiceDuties(query, account).expect(200)).items;
  }

  moveOf(response: request.Response): MoveWire {
    return this.dataOf<MoveWire>(response);
  }
}
