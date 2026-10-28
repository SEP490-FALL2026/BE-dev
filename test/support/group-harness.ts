import request from 'supertest';
import type { ApiAccount } from './api-accounts';
import type { Person } from './request-harness';
import { StatusHarness } from './status-harness';
import type { Unit } from './spend-harness';

/** A person of a department as a group names them: a colleague with a work email who starts today. */
export interface Colleague extends Person {
  code: string;
}

export interface LineWire {
  employee: { employeeId: string; employeeCode: string; fullName: string };
  position: number;
  state: string;
  needStep: { id: string; state: string; assignee: { employeeId: string } | null };
  expectedEndDate: string | null;
  needDecision: { decision: string; reason: string | null; deciderRole: string } | null;
  spendDecision: { decision: string; reason: string | null; deciderRole: string } | null;
  share: { amount: string; currency: string } | null;
  endedAt: string | null;
  endedBy: { employeeId: string } | null;
  endReason: string | null;
  cancelCause: string | null;
}

/** A line as the database keeps it. */
export interface LineRow {
  employee_id: string;
  state: string;
  need_step_id: string;
  expected_end_date: string | null;
  ended_by_employee_id: string | null;
  end_reason: string | null;
  cancel_cause: string | null;
}

/**
 * The status harness (the spend harness with the inbox and its projection) with what the requests for a group need: colleagues who can be named, the calls of the routes of a group, and
 * reads of the lines, their decisions and their shares as the database keeps them. No assertion lives here: the specs make them.
 */
export class GroupHarness extends StatusHarness {
  private colleagueNumber = 0;

  constructor() {
    super();
    // A seat of a request is taken on the subscription its department owns (F20, `QĐ-89a`), as on a request made through `sent`:
    // the department of a group request is learnt from the wire a spec reads back, and a grant made on the subscription of the
    // seeded department is made on the one the department of the request owns.
    const readData = this.dataOf;
    this.dataOf = <T>(response: Parameters<typeof readData>[0]): T => {
      const data = readData<T>(response);
      const request = (data as { request?: { id?: unknown; department?: { id?: unknown } } } | null | undefined)
        ?.request;
      if (typeof request?.id === 'string' && typeof request.department?.id === 'string') {
        this.owned.noteRequest(request.id, request.department.id);
      }

      return data;
    };
    const grantOnSeeded = this.grantLine;
    this.grantLine = (body: object, account: ApiAccount) => grantOnSeeded(this.owned.grantBody(body), account);
  }

  /** A colleague of the department who has a work email and starts today, until a test changes it. */
  async colleague(unit: Unit, prefix = 'G'): Promise<Colleague> {
    this.colleagueNumber += 1;
    const code = `${prefix}-N${this.colleagueNumber}-${unit.department.code}`;
    const person = await this.staff(unit.department, code);
    await this.ctx.sql.query(`UPDATE employees SET hire_date = current_date WHERE id = $1`, [person.employeeId]);

    return { ...person, code };
  }

  async colleagues(unit: Unit, count: number): Promise<Colleague[]> {
    const made: Colleague[] = [];
    for (let index = 0; index < count; index += 1) made.push(await this.colleague(unit));

    return made;
  }

  /** The body of a request for a group of these people: `extra` overrides a field. */
  groupBody = (planId: string, people: readonly Person[], extra: Record<string, unknown> = {}) => ({
    planId,
    lines: people.map((person) => ({ employeeId: person.employeeId })),
    businessReason: 'The new brand needs the shared workspace',
    termMonths: 12,
    ...extra,
  });

  checkGroup = (body: object, account: ApiAccount) =>
    request(this.server()).post('/api/v1/group-requests/check').set(this.as(account)).send(body);
  submitGroup = (body: object, account: ApiAccount) =>
    request(this.server()).post('/api/v1/group-requests').set(this.as(account)).send(body);
  candidates = (account: ApiAccount, query: Record<string, string | number> = {}) =>
    request(this.server()).get('/api/v1/group-request-candidates').query(query).set(this.as(account));
  linesOf = (id: string, account: ApiAccount, query: Record<string, string | number> = {}) =>
    request(this.server()).get(`/api/v1/access-requests/${id}/lines`).query(query).set(this.as(account));
  decideLines = (id: string, body: object, account: ApiAccount) =>
    request(this.server()).post(`/api/v1/access-requests/${id}/line-need-decisions`).set(this.as(account)).send(body);
  decideSpendLines = (id: string, body: object, account: ApiAccount) =>
    request(this.server()).post(`/api/v1/access-requests/${id}/line-spend-decisions`).set(this.as(account)).send(body);
  withdrawLine = (id: string, employeeId: string, body: object, account: ApiAccount) =>
    request(this.server())
      .post(`/api/v1/access-requests/${id}/lines/${employeeId}/withdraw`)
      .set(this.as(account))
      .send(body);
  closeLineForDeparture = (id: string, employeeId: string, body: object, account: ApiAccount) =>
    request(this.server())
      .post(`/api/v1/access-requests/${id}/lines/${employeeId}/departure-closure`)
      .set(this.as(account))
      .send(body);
  closeForDeparture = (id: string, body: object, account: ApiAccount) =>
    request(this.server()).post(`/api/v1/access-requests/${id}/cancellation`).set(this.as(account)).send(body);
  similarSeats = (id: string, account: ApiAccount, query: Record<string, string | number> = {}) =>
    request(this.server()).get(`/api/v1/access-requests/${id}/similar-seats`).query(query).set(this.as(account));
  grantLine = (body: object, account: ApiAccount) =>
    request(this.server()).post('/api/v1/provisioning-tasks').set(this.as(account)).send(body);
  decideNeed = (id: string, body: object, account: ApiAccount) =>
    request(this.server()).post(`/api/v1/access-requests/${id}/need-decision`).set(this.as(account)).send(body);

  /** The person has left the company: the employee record is terminated, as the departure of a person leaves it. */
  async depart(person: Person): Promise<void> {
    await this.ctx.sql.query(`UPDATE employees SET status = 'TERMINATED' WHERE id = $1`, [person.employeeId]);
  }

  /** Every line as the database keeps it, in the order the people were named. */
  async lineRows(requestId: string): Promise<LineRow[]> {
    return (
      await this.ctx.sql.query<LineRow>(
        `SELECT l.employee_id, l.state, l.need_step_id, to_char(l.expected_end_date, 'YYYY-MM-DD') AS expected_end_date,
                l.ended_by_employee_id, l.end_reason, l.cancel_cause::text AS cancel_cause
           FROM access_request_lines l JOIN access_request_beneficiaries b ON b.request_id = l.request_id AND b.employee_id = l.employee_id
          WHERE l.request_id = $1 ORDER BY b.position`,
        [requestId],
      )
    ).rows;
  }

  async lineStates(requestId: string): Promise<string[]> {
    return (await this.lineRows(requestId)).map((row) => row.state);
  }

  /** The shares of the people in the commitments of the request, by person and year. */
  async shares(
    requestId: string,
  ): Promise<Array<{ employee_id: string; budget_year: number; amount_minor: string; released_at: Date | null }>> {
    return (
      await this.ctx.sql.query<{
        employee_id: string;
        budget_year: number;
        amount_minor: string;
        released_at: Date | null;
      }>(
        `SELECT employee_id, budget_year, amount_minor::text, released_at FROM access_request_line_amounts
          WHERE request_id = $1 ORDER BY employee_id, budget_year`,
        [requestId],
      )
    ).rows;
  }

  /** The commitments held for the request, by year. */
  async commitments(requestId: string): Promise<Array<{ year: number; amount_minor: string; state: string }>> {
    return (
      await this.ctx.sql.query<{ year: number; amount_minor: string; state: string }>(
        `SELECT year, amount_minor::text, state::text FROM budget_commitments WHERE request_id = $1 ORDER BY year`,
        [requestId],
      )
    ).rows;
  }

  /** The need steps of the request, in order, as the database keeps them. */
  async needSteps(requestId: string): Promise<
    Array<{
      id: string;
      state: string;
      routing_row: number;
      assignee_employee_id: string | null;
      same_person_as_spend: boolean;
    }>
  > {
    return (
      await this.ctx.sql.query<{
        id: string;
        state: string;
        routing_row: number;
        assignee_employee_id: string | null;
        same_person_as_spend: boolean;
      }>(
        `SELECT id, state::text, routing_row, assignee_employee_id, same_person_as_spend FROM access_request_steps
          WHERE request_id = $1 AND kind = 'NEED' ORDER BY sequence`,
        [requestId],
      )
    ).rows;
  }

  /** The audit events of a request and of its steps, oldest first. */
  async trail(requestId: string): Promise<Array<{ action: string; after: Record<string, unknown> }>> {
    return (
      await this.ctx.sql.query<{ action: string; after: Record<string, unknown> }>(
        `SELECT action, after FROM audit_events
          WHERE after->>'requestId' = $1 OR resource_id::text = $1 ORDER BY occurred_at, id`,
        [requestId],
      )
    ).rows;
  }

  /** Approves the budget of the unit for this year and the next, with room for a group of any size a test makes. */
  async roomFor(unit: Unit, total = 100_000_000_000): Promise<void> {
    await this.budgetFor(unit, { total, percent: 100 });
    await this.budgetFor(unit, { total, percent: 100, year: this.next });
  }

  /** A group the head sent for these people, attached outside the plan and sent on, so that its spend step waits for the approver. */
  async groupWaiting(
    unit: Unit,
    planId: string,
    people: readonly Person[],
    extra: Record<string, unknown> = {},
  ): Promise<string> {
    const sent = this.dataOf<{ request: { id: string } }>(
      await this.submitGroup(this.groupBody(planId, people, extra), unit.head.account).expect(201),
    ).request;
    await this.setPlanLine(sent.id, { offPlan: true }, unit.head.account).expect(200);
    await this.sendOn([sent.id], unit.head.account).expect(201);

    return sent.id;
  }

  /** The same group, with every person approved as spend: each waits to be granted. */
  async groupApproved(unit: Unit, planId: string, people: readonly Person[]): Promise<string> {
    const id = await this.groupWaiting(unit, planId, people);
    await this.decideSpendLines(
      id,
      { lines: people.map((person) => ({ employeeId: person.employeeId, decision: 'APPROVE' })) },
      this.boss.account,
    ).expect(200);

    return id;
  }
}
