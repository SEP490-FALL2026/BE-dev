import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { TransactionRunner } from '../../../src/infrastructure/database/transaction-runner';
import { LicensingRenewalApi } from '../../../src/modules/licensing/public/licensing-renewal.api';
import { ApiAccount, createActivatedAccount } from '../../support/api-accounts';
import { RevocationHarness } from '../../support/revocation-harness';
import { changeRoleTo } from '../../support/builders/account.builder';
import { legacyServiceAccount } from '../../support/legacy-service-account';
import { k1Checklist } from '../../support/k1-checklist';

const h = new RevocationHarness();

/** Today in the calendar of the organization (the seeded one is Asia/Ho_Chi_Minh). */
function today(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());
}

interface ToolsWire {
  departmentId: string;
  asOf: string;
  summary: Array<{ applicationName: string; planName: string; seats: number }>;
  items: Array<{
    assignmentId: string;
    employeeCode: string;
    fullName: string;
    holderStatus: string;
    kind: string;
    source: string;
    application: { id: string; name: string };
    plan: { id: string; name: string };
    effectiveFrom: string;
    effectiveFromLabel: string | null;
    terminating: boolean;
    terminatingUntil: string | null;
  }>;
  pagination: { totalItems: number };
}

/**
 * The tools a department uses are grouped by the department that owns the seat, not by the department of whoever holds it (F22,
 * `QĐ-89a`): the seats on the subscriptions it owns, the service accounts it owns, and the seats of its members on internal software.
 */
describe('the tools a department uses (US-03-06 AC-13, AC-17, F22, integration, real PostgreSQL)', () => {
  let design: { id: string; code: string };
  let finance: { id: string; code: string };
  let headOfDesign: ApiAccount;
  let headOfFinance: ApiAccount;
  let figmaSubscription: string;
  let githubSubscription: string;

  const tools = (departmentId: string, headers: Record<string, string> = h.as(h.it1), query: object = {}) =>
    request(h.server()).get(`/api/v1/departments/${departmentId}/tools-in-use`).query(query).set(headers);
  const toolsOf = async (departmentId: string, query: object = {}): Promise<ToolsWire> =>
    h.dataOf<ToolsWire>(await tools(departmentId, h.as(h.it1), query).expect(200));

  const created = (response: request.Response): request.Response => {
    if (response.status !== 201) throw new Error(`${response.status} ${JSON.stringify(response.body)}`);

    return response;
  };
  /** The Super Admin creates the department (with no Cost Center) and Finance the Cost Center for it (`QĐ-87d(1)`). */
  const department = async (code: string) => {
    const made = h.dataOf<{ id: string; code: string }>(
      await request(h.server())
        .post('/api/v1/departments')
        .set({ Authorization: `Bearer ${h.admin}` })
        .send({ code, name: `Department ${code}` })
        .then(created),
    );
    await h.costCenterFor(made.id);

    return made;
  };
  const enter = async (departmentCode: string, code: string): Promise<string> =>
    h.dataOf<{ id: string }>(
      await request(h.server())
        .post('/api/v1/employees')
        .set({ Authorization: `Bearer ${h.admin}` })
        .send({
          employeeCode: code,
          fullName: `Person ${code}`,
          workEmail: `${code.toLowerCase()}@acme.vn`,
          employmentType: 'STAFF',
          // Long before any seat of the baseline: a seat never starts before the person does.
          hireDate: '2024-06-01',
          departmentCode,
          jobTitle: 'Administrator',
        })
        .then(created),
    ).id;
  const headAccount = async (dept: { id: string; code: string }, code: string): Promise<ApiAccount> => {
    const employeeId = await enter(dept.code, code);
    const account = await createActivatedAccount(h.ctx, h.seed, {
      code,
      email: `${code.toLowerCase()}@acme.vn`,
      role: 'EMPLOYEE',
      admin: h.admin,
      employeeId,
    });
    await changeRoleTo(h.ctx, h.admin, employeeId, 'MANAGER');
    await request(h.server())
      .post(`/api/v1/departments/${dept.id}/head-assignments`)
      .set({ Authorization: `Bearer ${h.admin}` })
      .send({ employeeId, effectiveFrom: today() })
      .expect(200);

    return account;
  };

  beforeAll(async () => {
    await h.start();
    design = await department('P-DES');
    finance = await department('P-FIN');
    headOfDesign = await headAccount(design, 'H-DES');
    headOfFinance = await headAccount(finance, 'H-FIN');
    for (const code of ['D-1', 'D-2', 'D-3', 'D-4', 'D-5', 'D-6']) await enter(design.code, code);
    await enter(finance.code, 'F-1');

    // Figma and GitHub belong to design, Slack to finance; a person of one department holds a seat on a subscription of the other (F22).
    figmaSubscription = await h.subscription(10, 'K2', design.id);
    githubSubscription = await h.subscription(10, 'K1', design.id);
    const slackSubscription = await h.subscription(10, 'K2', finance.id);
    const person = (code: string, prefix = '') => ({
      employee_code: code,
      account_identifier: `${prefix}${code.toLowerCase()}@acme.vn`,
    });
    await h.written({ subscriptionId: figmaSubscription }, [
      person('D-1'),
      person('D-2'),
      person('D-3'),
      person('F-1'),
      { ...person('D-6'), granted_on: '2025-01-01' },
    ]);
    await h.written({ subscriptionId: githubSubscription }, [person('D-4')]);
    // A service account of the earlier releases, written by SQL: it stays readable in the tools a department uses.
    const d5 = await h.ctx.sql.query<{ id: string }>(`SELECT id FROM employees WHERE employee_code = 'D-5'`);
    await legacyServiceAccount(h.ctx.sql, {
      subscriptionId: githubSubscription,
      employeeId: d5.rows[0].id,
      identifier: 'ci-bot',
      reason: 'CI',
    });
    await h.written({ subscriptionId: slackSubscription }, [person('F-1', 'slack-'), person('D-1', 'slack-')]);
    // Internal software has no subscription, so no owner: the seat of a member of finance on it is read through the member.
    await h.written({ planId: await h.plan('K5') }, [person('F-1', 'portal-')]);
  }, 240000);

  afterAll(async () => {
    await h.stop();
  });

  // Rewritten for QĐ-103d (the pool of seats is every department's): a seat carries the department of its holder, not the one that owns the
  // subscription, so a department's tools are the seats its people hold (and the service accounts it owns), on any subscription.
  it('AC-13, F22: lists exactly the seats the people of the department hold, on any subscription, and the service accounts it owns, and none of another department', async () => {
    const result = await toolsOf(design.id);

    expect(result.pagination.totalItems).toBe(7);
    // D1 holds a seat of Figma and one of Slack (finance's subscription): both are design's. F1, a person of finance, is not listed.
    expect(result.items.map((item) => item.employeeCode).sort()).toEqual([
      'D-1',
      'D-1',
      'D-2',
      'D-3',
      'D-4',
      'D-5',
      'D-6',
    ]);
    expect(result.items.find((item) => item.employeeCode === 'D-2')).toMatchObject({
      kind: 'PERSONAL',
      holderStatus: 'ACTIVE',
    });
    expect(result.items.find((item) => item.employeeCode === 'D-5')).toMatchObject({
      kind: 'SERVICE',
      source: 'REQUEST',
      holderStatus: 'ACTIVE',
    });
    expect(result.summary.map((entry) => entry.seats).sort()).toEqual([1, 2, 4]);
    expect(result.items[0]).toEqual(
      expect.objectContaining({
        application: { id: expect.any(String) as unknown, name: expect.any(String) as unknown },
        plan: { id: expect.any(String) as unknown, name: expect.any(String) as unknown },
      }),
    );
    expect(JSON.stringify(result)).not.toContain('@acme.vn');
    expect(JSON.stringify(result)).not.toContain('ci-bot');
  });

  it('F22: groups by the department of the holder (QĐ-103d): a person of design on a subscription of finance is a tool of design, not of finance', async () => {
    const result = await toolsOf(finance.id);

    // The three seats of F1 (Figma, Slack, internal software); the Slack seat of D1 is design's.
    expect(result.pagination.totalItems).toBe(3);
    expect(result.items.map((item) => item.employeeCode).sort()).toEqual(['F-1', 'F-1', 'F-1']);
    expect(result.items.every((item) => item.kind === 'PERSONAL')).toBe(true);
    expect((await toolsOf(design.id)).items.filter((item) => item.employeeCode === 'D-1')).toHaveLength(2);
  });

  /**
   * `terminating` is a K1 seat whose renewal was cancelled: a completed revocation whose access state is `UNTIL_PAID_END`
   * (`US-07-05` AC-19). A seat that only has an end day is not: a renewed seat and a service account passed to another person end
   * on a day and go on in the next record. Every case in its own department so the counts of the cases above stay as they are.
   */
  describe('F22, US-07-05 AC-19: terminating is a K1 seat whose renewal was cancelled and no seat that only has an end day', () => {
    let trm: { id: string; code: string };
    let trmSubscription: string;

    beforeAll(async () => {
      trm = await department('P-TRM');
      trmSubscription = await h.subscription(20, 'K1', trm.id);
    });

    /** A person of the department with a seat from long ago on its K1 subscription; extra columns of the file go with it. */
    const seatOf = async (code: string, extra: Record<string, string> = {}) => {
      const holder = await enter(trm.code, code);
      await h.written({ subscriptionId: trmSubscription }, [
        {
          employee_code: code,
          account_identifier: `${code.toLowerCase()}@acme.vn`,
          granted_on: '2026-01-05',
          ...extra,
        },
      ]);
      const seat = (await h.assignmentsOf({ subscriptionId: trmSubscription })).find(
        (assignment) => assignment.employeeId === holder,
      );
      if (!seat) throw new Error(`no seat of ${code}`);

      return seat.id;
    };
    const itemsOfTrm = async () => (await toolsOf(trm.id, { pageSize: 100 })).items;
    const terminatingCodes = async () =>
      (await itemsOfTrm()).filter((item) => item.terminating).map((item) => item.employeeCode);
    const validUntilOf = async (assignmentId: string): Promise<string | null> =>
      (
        await h.ctx.sql.query<{ valid_until: string | null }>(
          `SELECT to_char(valid_until, 'YYYY-MM-DD') AS valid_until FROM license_assignments WHERE id = $1`,
          [assignmentId],
        )
      ).rows[0].valid_until;

    it('tells the K1 seat whose renewal was cancelled, until the end of the paid period, and the seat that has no revocation as not', async () => {
      const cancelled = await seatOf('TR-CNL');
      await seatOf('TR-PLN');
      const { taskId } = await h.open(cancelled, 'ABRUPT_DEPARTURE');
      // A revocation that is opened and not done yet does not end the seat or make it terminating.
      expect((await itemsOfTrm()).find((item) => item.employeeCode === 'TR-CNL')).toMatchObject({
        terminating: false,
        terminatingUntil: null,
      });
      await h.claim(taskId).expect(200);
      await h
        .revoked(taskId, {
          completion: 'RENEWAL_CANCELLED',
          evidence: 'đã hủy',
          paidThroughOn: h.inDays(10),
          accessState: 'UNTIL_PAID_END',
          k1Checklist: k1Checklist('DEPARTURE'),
        })
        .expect(200);

      const items = await itemsOfTrm();

      expect(items.find((item) => item.employeeCode === 'TR-CNL')).toMatchObject({
        terminating: true,
        terminatingUntil: h.inDays(10),
      });
      expect(items.find((item) => item.employeeCode === 'TR-PLN')).toMatchObject({
        terminating: false,
        terminatingUntil: null,
      });
      expect(await terminatingCodes()).toEqual(['TR-CNL']);
    });

    it('does not tell a renewed seat, which ends on a day and goes on in the next record', async () => {
      const renewing = await seatOf('TR-RNW', { expected_end_date: h.inDays(5) });

      await h.ctx.app.get(TransactionRunner).run((tx) =>
        h.ctx.app.get(LicensingRenewalApi).renewAssignment(tx, h.actorOf(h.it1), {
          assignmentId: renewing,
          requestId: randomUUID(),
          previousExpectedEndDate: h.inDays(5),
          newExpectedEndDate: h.inDays(95),
          now: new Date(),
        }),
      );

      // The old record has an end day in the future, which is what the list used to read as "terminating".
      expect(await validUntilOf(renewing)).toBe(h.inDays(5));
      const renewed = (await itemsOfTrm()).find((item) => item.assignmentId === renewing);
      expect(renewed).toMatchObject({ employeeCode: 'TR-RNW', terminating: false, terminatingUntil: null });
      expect(await terminatingCodes()).toEqual(['TR-CNL']);
    });
  });

  it('shows a start that is only the day of recording with its label, never as a grant date', async () => {
    const result = await toolsOf(design.id);

    for (const item of result.items) {
      if (item.employeeCode === 'D-6')
        expect(item).toMatchObject({ effectiveFrom: '2025-01-01', effectiveFromLabel: null });
      else expect(item.effectiveFromLabel?.startsWith('ghi nhận từ ')).toBe(true);
    }
  });

  it('AC-13: lets the head of the department read it, and it is the same list', async () => {
    const asHead = h.dataOf<ToolsWire>(await tools(design.id, h.as(headOfDesign)).expect(200));

    expect(asHead.items.map((item) => item.assignmentId).sort()).toEqual(
      (await toolsOf(design.id)).items.map((item) => item.assignmentId).sort(),
    );
  });

  it('AC-17: refuses the head of another department, and the roles that have no business here', async () => {
    expect(h.codeOf(await tools(finance.id, h.as(headOfDesign)).expect(403))).toBe('DEPARTMENT.OUT_OF_SCOPE');
    expect(h.codeOf(await tools(design.id, h.as(headOfFinance)).expect(403))).toBe('DEPARTMENT.OUT_OF_SCOPE');
    for (const headers of [h.as(h.finance), h.as(h.employee), { Authorization: `Bearer ${h.admin}` }]) {
      expect(h.codeOf(await tools(design.id, headers).expect(403))).toBe('AUTHORIZATION.FORBIDDEN');
    }
    expect(h.codeOf(await request(h.server()).get(`/api/v1/departments/${design.id}/tools-in-use`).expect(401))).toBe(
      'AUTHENTICATION_REQUIRED',
    );
  });

  it('does not list a seat that has ended, and counts the seats of every page in the summary', async () => {
    const before = await toolsOf(design.id);
    expect(before.items.map((item) => item.employeeCode)).toContain('D-6');
    await h.ctx.sql.query(`UPDATE license_assignments SET valid_until = '2025-06-01' WHERE employee_id = $1`, [
      await employeeId('D-6'),
    ]);

    const second = await toolsOf(design.id, { pageSize: 2, page: 2 });
    const all = await toolsOf(design.id);

    expect(all.items.map((item) => item.employeeCode)).not.toContain('D-6');
    expect(second.pagination.totalItems).toBe(6);
    expect(second.items).toHaveLength(2);
    expect(second.summary.reduce((sum, entry) => sum + entry.seats, 0)).toBe(6);
  });

  it('answers 404 for a department that does not exist, 422 for a bad id or page, and has no way to write the list', async () => {
    expect(h.codeOf(await tools('3f0c7d54-9e1b-4f6a-8d2c-5b7a1e9c0d11').expect(404))).toBe('DEPARTMENT.NOT_FOUND');
    expect(h.codeOf(await tools('not-a-uuid').expect(422))).toBe('VALIDATION_ERROR');
    expect(h.codeOf(await tools(design.id, h.as(h.it1), { pageSize: 101 }).expect(422))).toBe('VALIDATION_ERROR');
    for (const method of ['post', 'put', 'patch', 'delete'] as const) {
      const response = await request(h.server())
        [method](`/api/v1/departments/${design.id}/tools-in-use`)
        .set(h.as(h.it1))
        .send({});
      expect([response.status, h.codeOf(response)]).toEqual([404, 'HTTP_NOT_FOUND']);
    }
  });

  const employeeId = async (code: string): Promise<string> =>
    (await h.ctx.sql.query<{ id: string }>(`SELECT id FROM employees WHERE employee_code = $1`, [code])).rows[0].id;
});
