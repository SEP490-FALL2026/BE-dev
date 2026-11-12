import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { ApiAccount, adminToken, createActivatedAccount } from '../../support/api-accounts';
import { HttpTestApp, SeededInstallation, createHttpTestApp, seedInstallation } from '../../support/http-test-app';
import { PgRelay } from '../../support/pg-relay';
import { QueryCounter, dataStatements } from '../../support/query-count';

interface ApplicationWire {
  id: string;
  responsibleItAdmin: { employeeId: string; employeeCode: string; fullName: string } | null;
  needsResponsible: boolean;
}

interface TransferWire {
  applicationId: string;
  responsibleItAdmin: { employeeId: string; employeeCode: string };
  changed: boolean;
}

const NO = { personToPersonMessaging: false, callsOrMeetings: false, mailbox: false };

/**
 * QĐ-111g, R-26, m-05: the IT Admin who answers for an application is the one who declared it, hands it over by the responsibility
 * transfer, and any IT Admin takes it while it needs one. The route that lists the IT Admins who work now feeds the choice.
 */
describe('the responsible IT Admin of an application over HTTP (integration, real PostgreSQL)', () => {
  let ctx: HttpTestApp;
  let seed: SeededInstallation;
  let admin: string;
  let it1: ApiAccount;
  let it2: ApiAccount;
  let it3: ApiAccount;
  let finance: ApiAccount;
  let employee: ApiAccount;
  let counter = 0;
  let relay: PgRelay;
  let statements: QueryCounter;
  const server = () => ctx.app.getHttpServer();
  const as = (account: ApiAccount) => ({ Authorization: `Bearer ${account.accessToken}` });
  const asSuperAdmin = () => ({ Authorization: `Bearer ${admin}` });
  const dataOf = <T>(response: request.Response): T => (response.body as { data: T }).data;
  const codeOf = (response: request.Response): string => (response.body as { error: { code: string } }).error.code;

  beforeAll(async () => {
    ctx = await createHttpTestApp({
      appDatabaseUrl: async (directUrl) => {
        const url = new URL(directUrl);
        relay = await PgRelay.start(url.hostname, Number(url.port || 5432));
        url.port = String(relay.port);

        return url.toString();
      },
    });
    statements = QueryCounter.on(relay);
    seed = await seedInstallation(ctx.app);
    admin = await adminToken(ctx, seed);
    const account = (code: string, role: 'IT_ADMIN' | 'FINANCE' | 'EMPLOYEE') =>
      createActivatedAccount(ctx, seed, { code, email: `${code.toLowerCase()}@acme.vn`, role, admin });
    it1 = await account('E-IT1', 'IT_ADMIN');
    it2 = await account('E-IT2', 'IT_ADMIN');
    it3 = await account('E-IT3', 'IT_ADMIN');
    finance = await account('E-FIN', 'FINANCE');
    employee = await account('E-EMP', 'EMPLOYEE');
  }, 180000);

  afterAll(async () => {
    await ctx?.close();
    await relay?.stop();
  });

  const declare = async (by: ApiAccount = it1): Promise<ApplicationWire> => {
    counter += 1;
    return dataOf<ApplicationWire>(
      await request(server())
        .post('/api/v1/applications')
        .set(as(by))
        .send({ name: `Responsibility app ${counter}`, kind: 'INTERNAL', dataSensitivity: 'LOW', communication: NO })
        .expect(201),
    );
  };
  const transfer = (applicationId: string, to: string, headers: Record<string, string>) =>
    request(server())
      .post(`/api/v1/applications/${applicationId}/responsibility-transfer`)
      .set(headers)
      .send({ toItAdminEmployeeId: to });
  const readApplication = async (id: string): Promise<ApplicationWire> =>
    dataOf<ApplicationWire>(await request(server()).get(`/api/v1/applications/${id}`).set(as(finance)).expect(200));
  const lock = (account: ApiAccount, locked: boolean) =>
    ctx.sql.query(`UPDATE app_users SET status = $2::"AppUserStatus" WHERE employee_id = $1`, [
      account.employeeId,
      locked ? 'LOCKED' : 'ACTIVE',
    ]);
  const responsibleOf = async (id: string): Promise<string | null> =>
    (
      await ctx.sql.query<{ r: string | null }>(
        `SELECT responsible_it_admin_employee_id AS r FROM applications WHERE id = $1`,
        [id],
      )
    ).rows[0].r;

  describe('the responsibility transfer (BB-4)', () => {
    it('lets the responsible IT Admin hand the application to another working IT Admin, audits who gave it to whom, and then refuses the one who gave it', async () => {
      const created = await declare(it1);
      expect(created.responsibleItAdmin?.employeeId).toBe(it1.employeeId);

      const handed = dataOf<TransferWire>(await transfer(created.id, it2.employeeId, as(it1)).expect(200));

      expect(handed).toMatchObject({
        applicationId: created.id,
        responsibleItAdmin: { employeeId: it2.employeeId },
        changed: true,
      });
      expect(await responsibleOf(created.id)).toBe(it2.employeeId);
      const events = await ctx.sql.query<{ before: object; after: object; actor_roles: string[] }>(
        `SELECT before, after, actor_roles FROM audit_events WHERE resource_id = $1 AND action = 'APPLICATION.RESPONSIBILITY_TRANSFERRED'`,
        [created.id],
      );
      expect(events.rows).toEqual([
        {
          before: { responsibleItAdminEmployeeId: it1.employeeId },
          after: { responsibleItAdminEmployeeId: it2.employeeId },
          actor_roles: ['IT_ADMIN'],
        },
      ]);
      expect(codeOf(await transfer(created.id, it1.employeeId, as(it1)).expect(403))).toBe(
        'APPLICATION.RESPONSIBILITY_NOT_YOURS',
      );
      expect(await responsibleOf(created.id)).toBe(it2.employeeId);
    });

    it('refuses another IT Admin while the application has a responsible IT Admin who works (403), and a person who is not a working IT Admin (422), changing nothing', async () => {
      const created = await declare(it1);

      expect(codeOf(await transfer(created.id, it3.employeeId, as(it3)).expect(403))).toBe(
        'APPLICATION.RESPONSIBILITY_NOT_YOURS',
      );
      for (const notItAdmin of [employee.employeeId, finance.employeeId, randomUUID()]) {
        expect(codeOf(await transfer(created.id, notItAdmin, as(it1)).expect(422))).toBe(
          'APPLICATION.RESPONSIBLE_NOT_IT_ADMIN',
        );
      }
      await lock(it3, true);
      try {
        expect(codeOf(await transfer(created.id, it3.employeeId, asSuperAdmin()).expect(422))).toBe(
          'APPLICATION.RESPONSIBLE_NOT_IT_ADMIN',
        );
      } finally {
        await lock(it3, false);
      }
      expect(await responsibleOf(created.id)).toBe(it1.employeeId);
    });

    it('m-05: when the responsible person is no longer a working IT Admin the application says it needs one, any IT Admin takes it for themselves only, and the Super Admin names any', async () => {
      const created = await declare(it1);
      await lock(it1, true);
      try {
        expect(await readApplication(created.id)).toMatchObject({
          responsibleItAdmin: { employeeId: it1.employeeId },
          needsResponsible: true,
        });

        expect(codeOf(await transfer(created.id, it2.employeeId, as(it3)).expect(403))).toBe(
          'APPLICATION.RESPONSIBILITY_NOT_YOURS',
        );
        const taken = dataOf<TransferWire>(await transfer(created.id, it3.employeeId, as(it3)).expect(200));
        expect(taken).toMatchObject({ responsibleItAdmin: { employeeId: it3.employeeId }, changed: true });
        expect(await readApplication(created.id)).toMatchObject({
          responsibleItAdmin: { employeeId: it3.employeeId },
          needsResponsible: false,
        });

        const again = await declare(it2);
        await ctx.sql.query(`UPDATE applications SET responsible_it_admin_employee_id = NULL WHERE id = $1`, [
          again.id,
        ]);
        expect(await readApplication(again.id)).toMatchObject({ responsibleItAdmin: null, needsResponsible: true });
        await transfer(again.id, it2.employeeId, asSuperAdmin()).expect(200);
        expect(await responsibleOf(again.id)).toBe(it2.employeeId);
      } finally {
        await lock(it1, false);
      }
    });

    it('m-05: a responsible IT Admin who has left but whose account nobody locked yet is not a working IT Admin: the application needs one, another takes it, and nobody hands it to the leaver', async () => {
      const created = await declare(it1);
      const leave = (left: boolean) =>
        ctx.sql.query(`UPDATE employees SET status = $2::"EmployeeStatus" WHERE id = $1`, [
          it1.employeeId,
          left ? 'TERMINATED' : 'ACTIVE',
        ]);
      await leave(true);
      try {
        expect(await readApplication(created.id)).toMatchObject({
          responsibleItAdmin: { employeeId: it1.employeeId },
          needsResponsible: true,
        });
        const taken = dataOf<TransferWire>(await transfer(created.id, it2.employeeId, as(it2)).expect(200));
        expect(taken).toMatchObject({ responsibleItAdmin: { employeeId: it2.employeeId }, changed: true });
        expect(codeOf(await transfer(created.id, it1.employeeId, asSuperAdmin()).expect(422))).toBe(
          'APPLICATION.RESPONSIBLE_NOT_IT_ADMIN',
        );
        expect(await responsibleOf(created.id)).toBe(it2.employeeId);
      } finally {
        await leave(false);
      }
    });

    it('hands to the one already responsible without writing or auditing anything, and answers changed false', async () => {
      const created = await declare(it1);

      const same = dataOf<TransferWire>(await transfer(created.id, it1.employeeId, as(it1)).expect(200));

      expect(same.changed).toBe(false);
      const events = await ctx.sql.query(
        `SELECT 1 FROM audit_events WHERE resource_id = $1 AND action = 'APPLICATION.RESPONSIBILITY_TRANSFERRED'`,
        [created.id],
      );
      expect(events.rowCount).toBe(0);
    });

    it('two IT Admins who take an application that needs one at the same moment: one gets 200, the other 403, and exactly one is responsible', async () => {
      const created = await declare(it1);
      await ctx.sql.query(`UPDATE applications SET responsible_it_admin_employee_id = NULL WHERE id = $1`, [
        created.id,
      ]);

      const [a, b] = await Promise.all([
        transfer(created.id, it2.employeeId, as(it2)),
        transfer(created.id, it3.employeeId, as(it3)),
      ]);

      expect([a.status, b.status].sort()).toEqual([200, 403]);
      const winner = a.status === 200 ? it2 : it3;
      expect(await responsibleOf(created.id)).toBe(winner.employeeId);
      const events = await ctx.sql.query(
        `SELECT 1 FROM audit_events WHERE resource_id = $1 AND action = 'APPLICATION.RESPONSIBILITY_TRANSFERRED'`,
        [created.id],
      );
      expect(events.rowCount).toBe(1);
    });

    it('answers 404 for an application that does not exist, and 403 to Finance, an employee and nobody signed in with a role', async () => {
      const created = await declare(it1);

      expect(codeOf(await transfer(randomUUID(), it2.employeeId, as(it1)).expect(404))).toBe('APPLICATION.NOT_FOUND');
      for (const account of [finance, employee]) {
        await transfer(created.id, it2.employeeId, as(account)).expect(403);
      }
      expect(await responsibleOf(created.id)).toBe(it1.employeeId);
    });
  });

  describe('the IT Admins who work now (BB-5)', () => {
    const list = (query: Record<string, string | number> = {}, headers: Record<string, string> = as(it1)) =>
      request(server()).get('/api/v1/it-admins').query(query).set(headers);

    it('lists the employees with an IT Admin grant on an account that can act, by code; a locked account drops out', async () => {
      const all = dataOf<{
        items: { employeeId: string; employeeCode: string; fullName: string }[];
        pagination: { totalItems: number };
      }>(await list().expect(200));
      expect(all.items.map((row) => row.employeeCode)).toEqual(['E-IT1', 'E-IT2', 'E-IT3']);
      expect(all.items[0]).toEqual({
        employeeId: it1.employeeId,
        employeeCode: 'E-IT1',
        fullName: expect.any(String) as string,
      });
      expect(all.pagination.totalItems).toBe(3);

      await lock(it2, true);
      try {
        const without = dataOf<{ items: { employeeCode: string }[] }>(await list({}, asSuperAdmin()).expect(200));
        expect(without.items.map((row) => row.employeeCode)).toEqual(['E-IT1', 'E-IT3']);
      } finally {
        await lock(it2, false);
      }
    });

    it('searches by code or name, pages, and refuses Finance and an employee', async () => {
      const found = dataOf<{ items: { employeeCode: string }[] }>(await list({ search: 'e-it3' }).expect(200));
      expect(found.items.map((row) => row.employeeCode)).toEqual(['E-IT3']);
      const second = dataOf<{
        items: { employeeCode: string }[];
        pagination: { page: number; pageSize: number; totalItems: number; totalPages: number };
      }>(await list({ page: 2, pageSize: 2 }).expect(200));
      expect(second.items.map((row) => row.employeeCode)).toEqual(['E-IT3']);
      expect(second.pagination).toEqual({ page: 2, pageSize: 2, totalItems: 3, totalPages: 2 });
      for (const account of [finance, employee]) await list({}, as(account)).expect(403);
    });

    it('finds by a part of the name, literally, and pages in SQL: as many statements for one IT Admin as for three (API-LIST-DETAIL.1)', async () => {
      const { rows } = await ctx.sql.query<{ full_name: string }>(`SELECT full_name FROM employees WHERE id = $1`, [
        it2.employeeId,
      ]);
      const byName = dataOf<{ items: { employeeCode: string }[] }>(
        await list({ search: rows[0].full_name }).expect(200),
      );
      expect(byName.items.map((row) => row.employeeCode)).toEqual(['E-IT2']);
      const wildcard = dataOf<{ items: unknown[] }>(await list({ search: '%' }).expect(200));
      expect(wildcard.items).toEqual([]);

      const many = await statements.run(() => list({ pageSize: 2 }).expect(200));
      const one = await statements.run(() => list({ search: 'E-IT1' }).expect(200));
      expect(dataStatements(many.statements)).toHaveLength(dataStatements(one.statements).length);
    });
  });
});
