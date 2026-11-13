import request from 'supertest';
import { RequestsApi } from '../../../src/modules/requests/public/requests.api';
import type { ApiAccount } from '../../support/api-accounts';
import { PgRelay } from '../../support/pg-relay';
import { dataStatements, QueryCounter, tablesOf } from '../../support/query-count';
import type { Department, Person } from '../../support/request-harness';
import { SeatRevocationHarness } from '../../support/seat-revocation-harness';

const h = new SeatRevocationHarness();

interface Unit {
  department: Department;
  head: Person;
}
interface Page<T> {
  items: T[];
  pagination: { page: number; pageSize: number; totalItems: number; totalPages: number };
}
interface MemberWire {
  employeeId: string;
  employeeCode: string;
  fullName: string;
  status: string;
  hasWorkEmail: boolean;
  memberSince: string;
  heldSoftwareCount: number;
  openRequestCount: number;
}
interface RightWire {
  assignmentId: string;
  applicationName: string;
  planName: string;
  grantedOn: string;
  endsOn: string | null;
}
interface OpenRequestWire {
  requestId: string;
  type: string;
  state: string;
  applicationName: string | null;
  planName: string | null;
  submittedAt: string;
  group: boolean;
}

/**
 * QĐ-41c(2): the head of a department reads one person placed in it today — the record without email or contract, the software the
 * person holds and the requests of theirs from this department that are not over — and nobody else does. Over HTTP, on real PostgreSQL,
 * with a number of statements that does not grow with what the person holds (API-LIST-DETAIL.1).
 */
describe('a head reads one person of the department (integration, real PostgreSQL)', () => {
  let relay: PgRelay;
  let counter: QueryCounter;
  let des: Unit;
  let fin: Unit;
  let e1: Person;
  let oldRequestId: string;
  let newRequestId: string;
  let seatTools: string[];
  let requestPlans: string[];

  const path = (department: Department, employeeId: string, tail = '') =>
    `/api/v1/departments/${department.id}/employees/${employeeId}${tail}`;
  const read = (account: ApiAccount, url: string) => request(h.server()).get(url).set(h.as(account));
  const codeOf = (response: request.Response) => (response.body as { error: { code: string } }).error.code;
  /** The code and the message of a refusal: the id of the request that carried it is different each time. */
  const errorOf = (response: request.Response) => {
    const { code, message } = (response.body as { error: { code: string; message: string } }).error;

    return { code, message };
  };

  beforeAll(async () => {
    await h.start({
      appDatabaseUrl: async (directUrl) => {
        const url = new URL(directUrl);
        relay = await PgRelay.start(url.hostname, Number(url.port || 5432));
        url.port = String(relay.port);

        return url.toString();
      },
    });
    counter = QueryCounter.on(relay);
    await h.withApprover();
    requestPlans = [];
    for (let i = 0; i < 4; i += 1) {
      const planId = await h.planOf(await h.subscription(40));
      await h
        .declareTaxProfile((await h.vendorOf(planId)).id, [{ taxType: 'GTGT', ratePercent: '10', deductible: true }])
        .expect(200);
      requestPlans.push(planId);
    }
    seatTools = [];
    for (let i = 0; i < 5; i += 1) seatTools.push(await h.subscription(80, 'K2'));
    des = await h.departmentWithHead('P-MD-DES');
    fin = await h.departmentWithHead('P-MD-FIN');
    // The person comes from `fin`: two seats and a request they sent there, then they move to `des` and send a second request.
    e1 = await h.veteran(fin.department, 'E1-MD');
    await h.seatOf(e1, { subscriptionId: seatTools[0] }, 'E1-MD');
    await h.seatOf(e1, { subscriptionId: seatTools[1] }, 'E1-MD');
    // A free internal plan: the paid requests sent from the old department are closed by the system the day the transfer takes effect (QĐ-110o), the free ones stay open.
    oldRequestId = (await h.sent(e1, await h.plan('K5'))).id;
    await h.moveToday(e1, des.department);
    newRequestId = (await h.sent(e1, requestPlans[1], { termMonths: 1 })).id;
  }, 300000);

  afterAll(async () => {
    await h.stop();
    await relay?.stop();
  });

  describe('what the head of the department reads', () => {
    it('gives the record of QĐ-41c(2) and the two counts, and nothing of the email, the contract or the work state', async () => {
      const response = await read(des.head.account, path(des.department, e1.employeeId)).expect(200);
      const data = (response.body as { data: MemberWire }).data;

      expect(Object.keys(data).sort()).toEqual(
        [
          'employeeCode',
          'employeeId',
          'fullName',
          'hasWorkEmail',
          'heldSoftwareCount',
          'memberSince',
          'openRequestCount',
          'status',
        ].sort(),
      );
      expect(data).toEqual({
        employeeId: e1.employeeId,
        employeeCode: 'E1-MD',
        fullName: 'Person E1-MD',
        status: 'ACTIVE',
        hasWorkEmail: true,
        memberSince: h.today(),
        heldSoftwareCount: 2,
        openRequestCount: 1,
      });
      expect(JSON.stringify(response.body)).not.toMatch(/e1-md@acme\.vn|employmentType|workState|jobTitle/);
    });

    it('lists the software the person holds, with the names, the days, and no price, key, identifier or reason', async () => {
      const response = await read(des.head.account, path(des.department, e1.employeeId, '/software-rights')).expect(
        200,
      );
      const data = (response.body as { data: Page<RightWire> }).data;
      const names = await h.ctx.sql.query<{ plan_name: string; application_name: string }>(
        `SELECT p.name AS plan_name, a.name AS application_name FROM license_assignments la
           JOIN plans p ON p.id = la.plan_id JOIN applications a ON a.id = p.application_id
          WHERE la.employee_id = $1 ORDER BY la.valid_from, la.id`,
        [e1.employeeId],
      );

      expect(data.pagination).toEqual({ page: 1, pageSize: 20, totalItems: 2, totalPages: 1 });
      expect(data.items.map((item) => ({ applicationName: item.applicationName, planName: item.planName }))).toEqual(
        names.rows.map((row) => ({ applicationName: row.application_name, planName: row.plan_name })),
      );
      for (const item of data.items) {
        expect(Object.keys(item).sort()).toEqual([
          'applicationName',
          'assignmentId',
          'endsOn',
          'grantedOn',
          'planName',
        ]);
        expect(item).toMatchObject({ grantedOn: '2026-01-05', endsOn: null });
      }
      expect(JSON.stringify(response.body)).not.toMatch(
        /grantReason|revocationNote|accountIdentifier|licenseKey|price/i,
      );
    });

    it('lists only the open requests sent from this department: the one sent from the department they came from stays out', async () => {
      const response = await read(des.head.account, path(des.department, e1.employeeId, '/open-requests')).expect(200);
      const data = (response.body as { data: Page<OpenRequestWire> }).data;

      expect(data.pagination.totalItems).toBe(1);
      expect(data.items.map((item) => item.requestId)).toEqual([newRequestId]);
      expect(Object.keys(data.items[0]).sort()).toEqual([
        'applicationName',
        'group',
        'planName',
        'requestId',
        'state',
        'submittedAt',
        'type',
      ]);
      expect(data.items[0]).toMatchObject({ type: 'GRANT', group: false });
      expect(data.items[0].applicationName).toEqual(expect.any(String));
      expect(JSON.stringify(response.body)).not.toMatch(/requester|amount|businessReason|termMonths/i);
    });

    it('still gives the facade the open requests of every department when no department is asked for (MF-2 as before)', async () => {
      const all = await h.ctx.app.get(RequestsApi).listOpenOfBeneficiary(e1.employeeId, { skip: 0, take: 10 });
      const here = await h.ctx.app
        .get(RequestsApi)
        .listOpenOfBeneficiary(e1.employeeId, { skip: 0, take: 10 }, undefined, { departmentId: des.department.id });

      expect(all.items.map((item) => item.requestId).sort()).toEqual([oldRequestId, newRequestId].sort());
      expect(all.total).toBe(2);
      expect(here.items.map((item) => item.requestId)).toEqual([newRequestId]);
    });

    it('cuts the lists into pages with a stable order and the total of the whole list', async () => {
      const second = await read(
        des.head.account,
        path(des.department, e1.employeeId, '/software-rights?page=2&pageSize=1'),
      ).expect(200);
      const first = await read(
        des.head.account,
        path(des.department, e1.employeeId, '/software-rights?page=1&pageSize=1'),
      ).expect(200);
      const secondData = (second.body as { data: Page<RightWire> }).data;
      const firstData = (first.body as { data: Page<RightWire> }).data;

      expect(secondData.pagination).toEqual({ page: 2, pageSize: 1, totalItems: 2, totalPages: 2 });
      expect(secondData.items).toHaveLength(1);
      expect(firstData.items[0].assignmentId).not.toBe(secondData.items[0].assignmentId);
      const beyond = await read(des.head.account, path(des.department, e1.employeeId, '/open-requests?page=2')).expect(
        200,
      );
      expect((beyond.body as { data: Page<OpenRequestWire> }).data.items).toEqual([]);
    });

    it('lets the head read themself: they are a member of the department', async () => {
      const response = await read(des.head.account, path(des.department, des.head.employeeId)).expect(200);

      expect((response.body as { data: MemberWire }).data).toMatchObject({
        employeeId: des.head.employeeId,
        heldSoftwareCount: 0,
        openRequestCount: 0,
      });
    });
  });

  describe('who may not read, and what is not found', () => {
    const tails = ['', '/software-rights', '/open-requests'];

    it.each(tails)(
      'refuses the head of another department with 403 DEPARTMENT_MEMBER.OUT_OF_SCOPE (%p)',
      async (tail) => {
        const response = await read(fin.head.account, path(des.department, e1.employeeId, tail)).expect(403);

        expect(codeOf(response)).toBe('DEPARTMENT_MEMBER.OUT_OF_SCOPE');
      },
    );

    it.each(tails)('refuses every role that is not a head with 403 (%p)', async (tail) => {
      const url = path(des.department, e1.employeeId, tail);
      for (const account of [e1.account, h.it1, h.finance, h.sa, h.boss.account]) {
        const response = await read(account, url).expect(403);
        expect(codeOf(response)).toBe('AUTHORIZATION.FORBIDDEN');
      }
    });

    it.each(tails)(
      'does not find the person in the department they moved away from, nor one who does not exist (%p)',
      async (tail) => {
        const moved = await read(fin.head.account, path(fin.department, e1.employeeId, tail)).expect(404);
        const unknown = await read(
          des.head.account,
          path(des.department, '5b1b4f7e-0a52-4b0e-9f5b-9f3c1a2d7e10', tail),
        ).expect(404);
        const elsewhere = await read(des.head.account, path(des.department, fin.head.employeeId, tail)).expect(404);

        expect(codeOf(moved)).toBe('DEPARTMENT_MEMBER.NOT_FOUND');
        expect(errorOf(unknown)).toEqual(errorOf(moved));
        expect(errorOf(elsewhere)).toEqual(errorOf(moved));
      },
    );

    it.each(tails)('does not find a department that does not exist (%p)', async (tail) => {
      const response = await read(
        des.head.account,
        `/api/v1/departments/5b1b4f7e-0a52-4b0e-9f5b-9f3c1a2d7e10/employees/${e1.employeeId}${tail}`,
      ).expect(404);

      expect(codeOf(response)).toBe('DEPARTMENT_MEMBER.NOT_FOUND');
    });

    it('refuses a page size over 100 with 422 before reading anything', async () => {
      const response = await read(
        des.head.account,
        path(des.department, e1.employeeId, '/software-rights?pageSize=101'),
      ).expect(422);

      expect(codeOf(response)).toBe('VALIDATION_ERROR');
    });
  });

  describe('the number of statements does not grow with what the person holds (API-LIST-DETAIL.1)', () => {
    it('is the same for a person with two seats and one request as for one with five seats and three requests', async () => {
      const many = await h.veteran(des.department, 'E3-MD');
      for (const subscriptionId of seatTools) await h.seatOf(many, { subscriptionId }, 'E3-MD');
      for (const planId of requestPlans.slice(0, 3)) await h.sent(many, planId, { termMonths: 1 });
      const routes = [
        ['detail', ''],
        ['software', '/software-rights?pageSize=100'],
        ['requests', '/open-requests?pageSize=100'],
      ] as const;

      for (const [name, tail] of routes) {
        const few = await counter.run(() =>
          read(des.head.account, path(des.department, e1.employeeId, tail)).expect(200),
        );
        const wide = await counter.run(() =>
          read(des.head.account, path(des.department, many.employeeId, tail)).expect(200),
        );
        const bodyOf = (run: { result: request.Response }) => run.result.body as { data: MemberWire & Page<unknown> };
        if (name === 'detail')
          expect(bodyOf(wide).data.heldSoftwareCount).toBeGreaterThan(bodyOf(few).data.heldSoftwareCount);
        else expect(bodyOf(wide).data.items.length).toBeGreaterThan(bodyOf(few).data.items.length);
        expect({ name, statements: dataStatements(wide.statements).length }).toEqual({
          name,
          statements: dataStatements(few.statements).length,
        });
        if (name === 'software') {
          // The caller's own record is read to sign them in; the list itself reads no column of the person beyond the seats.
          const ofSeats = dataStatements(wide.statements).filter((sql) =>
            tablesOf(sql).includes('license_assignments'),
          );
          expect(ofSeats.length).toBeGreaterThan(0);
          expect(ofSeats.join('\n')).not.toMatch(/work_email|employment_type|full_name|account_identifier|"reason"/);
        }
      }
    }, 300000);
  });
});
