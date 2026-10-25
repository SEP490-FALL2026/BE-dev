import request from 'supertest';
import { ExpiryReminderService } from '../../src/modules/licensing/expiry/expiry-reminder.service';
import { LicensingService } from '../../src/modules/licensing/licensing.service';
import type { PendingRenewal, RenewalHold } from '../../src/modules/licensing/licensing-renewal.types';
import { RenewalHoldReader } from '../../src/modules/requests/renewal-request/renewal-hold.reader';
import type { ApiAccount } from './api-accounts';
import { ReturnHarness } from './return-harness';

export interface ExpiredRightWire {
  assignmentId: string;
  employee: { id: string; employeeCode: string; fullName: string };
  department: { id: string; code: string; name: string } | null;
  plan: { planId: string; provisioningType: string; dataLossOnRemoval: boolean };
  expectedEndDate: string;
  daysOverdue: number;
  debt: boolean;
  status: 'WAITING_RENEWAL_DECISION' | 'READY_TO_REVOKE' | 'REVOCATION_OPEN';
  pendingRenewal: { requestId: string; state: string } | null;
  revocation: { taskId: string; status: string } | null;
  handover: {
    dutyId: string;
    status: string;
    role: string;
    dueOn: string;
    overdue: boolean;
    flaggedUnconfirmed: boolean;
  } | null;
}

export interface ReminderWire {
  id: string;
  assignmentId: string;
  audience: 'EMPLOYEE' | 'HEAD' | 'IT_ADMIN';
  expectedEndDate: string;
  recipient: { id: string };
  holder: { id: string };
  plan: { planId: string };
  createdAt: string;
}

export interface ReminderRow {
  audience: string;
  recipient_employee_id: string;
  department_id: string | null;
  expected_end_date: string;
}

export interface DutyRow {
  id: string;
  source: string;
  confirmer_role: string;
  due_on: string;
  confirmed_value: string | null;
  proceeded_unconfirmed_at: Date | null;
}

/**
 * The return harness with what the tests of the rights that end on a day need: the three routes, the hourly pass run by hand, the
 * rows the database keeps, and a stand-in for the renewals that wait (the module of requests registers the real reader, which
 * only knows renewals that were really sent). No assertion lives here.
 */
export class ExpiryHarness extends ReturnHarness {
  queue = (query = '', account: ApiAccount = this.it1) =>
    request(this.server()).get(`/api/v1/assignment-expiry-queue${query}`).set(this.as(account));
  startRevocation = (assignmentId: string, account: ApiAccount = this.it1) =>
    request(this.server()).post(`/api/v1/assignment-expiry-queue/${assignmentId}/revocation`).set(this.as(account));
  reminders = (query = '', account: ApiAccount = this.it1) =>
    request(this.server()).get(`/api/v1/assignment-expiry-reminders${query}`).set(this.as(account));
  confirmDuty = (id: string, body: object, account: ApiAccount = this.it1) =>
    request(this.server()).post(`/api/v1/handover-duties/${id}/confirmations`).set(this.as(account)).send(body);

  /** The hourly pass, run by hand as if it were `now`; returns how many reminders were new. */
  noticeDue = (now?: Date): Promise<number> => this.ctx.app.get(ExpiryReminderService).noticeDue(now);

  /** The rows of the queue, every page, as the route answers for the IT Admin. */
  async queueRows(query = ''): Promise<ExpiredRightWire[]> {
    const response = await this.queue(`?pageSize=100${query}`).expect(200);

    return this.dataOf<{ items: ExpiredRightWire[] }>(response).items;
  }

  async queueRowOf(assignmentId: string): Promise<ExpiredRightWire | undefined> {
    return (await this.queueRows()).find((row) => row.assignmentId === assignmentId);
  }

  async remindersOf(assignmentId: string, account: ApiAccount = this.it1, scope = 'all'): Promise<ReminderWire[]> {
    const response = await this.reminders(`?scope=${scope}&assignmentId=${assignmentId}&pageSize=100`, account).expect(
      200,
    );

    return this.dataOf<{ items: ReminderWire[] }>(response).items;
  }

  async reminderRows(assignmentId: string): Promise<ReminderRow[]> {
    const { rows } = await this.ctx.sql.query<ReminderRow>(
      `SELECT audience::text, recipient_employee_id, department_id, to_char(expected_end_date, 'YYYY-MM-DD') AS expected_end_date
         FROM assignment_expiry_reminders WHERE assignment_id = $1 ORDER BY audience::text, expected_end_date`,
      [assignmentId],
    );

    return rows;
  }

  /** The handover duties of a seat, oldest first. */
  async dutyRows(assignmentId: string): Promise<DutyRow[]> {
    const { rows } = await this.ctx.sql.query<DutyRow>(
      `SELECT id, source::text, confirmer_role::text, to_char(due_on, 'YYYY-MM-DD') AS due_on,
              confirmed_value::text, proceeded_unconfirmed_at
         FROM handover_duties WHERE assignment_id = $1 ORDER BY created_at, id`,
      [assignmentId],
    );

    return rows;
  }

  /** Sets the end date of a right that had none (the database refuses to change one that was set). */
  async giveEndDate(assignmentId: string, day: string): Promise<void> {
    await this.ctx.sql.query(`UPDATE license_assignments SET expected_end_date = $2 WHERE id = $1`, [
      assignmentId,
      day,
    ]);
  }

  /**
   * Stands in for the module of requests: these seats have a renewal waiting. Returns what puts the real reader back. The real
   * reader answers only for renewals that were really sent, and a renewal sent in time is for a right that has not ended yet.
   */
  waitingRenewals(waiting: ReadonlyMap<string, PendingRenewal>): () => void {
    const licensing = this.ctx.app.get(LicensingService);
    const real = this.ctx.app.get(RenewalHoldReader);
    const fake: RenewalHold = {
      hasPendingRenewal: (assignmentId) => Promise.resolve(waiting.has(assignmentId)),
      pendingRenewalsOf: (ids) =>
        Promise.resolve(new Map([...waiting].filter(([assignmentId]) => ids.includes(assignmentId)))),
    };
    licensing.registerRenewalHold(fake);

    return () => licensing.registerRenewalHold(real);
  }
}
