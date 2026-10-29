import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { ApplicationLookupService } from '../../../src/modules/catalog/catalog-entry/application-lookup.service';
import { ApiAccount, adminToken, createActivatedAccount } from '../../support/api-accounts';
import {
  HttpTestApp,
  SeededInstallation,
  createHttpTestApp,
  insertEmployeeFixture,
  seedInstallation,
} from '../../support/http-test-app';

interface ApplicationWire {
  id: string;
  name: string;
  kind: string;
  businessOwner: { employeeId: string; employeeCode: string; status: string };
  businessOwnerReplacementRequired: boolean;
}

interface WarningWire {
  applicationId: string;
  applicationName: string;
  kind: string;
  businessOwner: { employeeId: string; employeeCode: string; status: string };
}

interface PeriodWire {
  employee: { employeeId: string; employeeCode: string; status: string };
  assignedAt: string;
  assignedBy: string | null;
  endedAt: string | null;
}

const NO = { personToPersonMessaging: false, callsOrMeetings: false, mailbox: false };

describe('Business Owner replacement over HTTP (integration, real PostgreSQL)', () => {
  let ctx: HttpTestApp;
  let seed: SeededInstallation;
  let admin: string;
  let it1: ApiAccount;
  let finance: ApiAccount;
  let employee: ApiAccount;
  let lookup: ApplicationLookupService;
  let counter = 0;
  const server = () => ctx.app.getHttpServer();
  const as = (account: ApiAccount) => ({ Authorization: `Bearer ${account.accessToken}` });

  beforeAll(async () => {
    ctx = await createHttpTestApp();
    seed = await seedInstallation(ctx.app);
    admin = await adminToken(ctx, seed);
    it1 = await createActivatedAccount(ctx, seed, { code: 'E-IT1', email: 'it1@acme.vn', roles: ['IT_ADMIN'], admin });
    finance = await createActivatedAccount(ctx, seed, {
      code: 'E-FIN',
      email: 'fin@acme.vn',
      roles: ['FINANCE'],
      admin,
    });
    employee = await createActivatedAccount(ctx, seed, { code: 'E-EMP', email: 'emp@acme.vn', roles: [], admin });
    lookup = ctx.app.get(ApplicationLookupService, { strict: false });
  }, 120000);

  afterAll(async () => {
    await ctx?.close();
  });

  const unique = (prefix: string): string => `${prefix} ${(counter += 1)}`;
  const dataOf = <T>(response: request.Response): T => (response.body as { data: T }).data;
  const codeOf = (response: request.Response): string => (response.body as { error: { code: string } }).error.code;
  const person = async (leaves = false): Promise<string> => {
    const code = unique('B');
    const { employeeId } = await insertEmployeeFixture(ctx.app, seed, {
      code,
      email: `${code.replace(' ', '')}@acme.vn`,
    });
    if (leaves) await ctx.sql.query(`UPDATE employees SET status = 'TERMINATED' WHERE id = $1`, [employeeId]);

    return employeeId;
  };
  const leaves = (employeeId: string) =>
    ctx.sql.query(`UPDATE employees SET status = 'TERMINATED' WHERE id = $1`, [employeeId]);
  const application = async (
    ownerId: string,
    kind: 'SAAS' | 'INTERNAL' = 'SAAS',
    name = unique('App'),
  ): Promise<ApplicationWire> =>
    dataOf<ApplicationWire>(
      await request(server())
        .post('/api/v1/applications')
        .set(as(it1))
        .send({
          name,
          kind,
          ...(kind === 'INTERNAL' ? {} : { vendorName: unique('Vendor') }),
          dataSensitivity: 'LOW',
          businessOwnerEmployeeId: ownerId,
          communication: NO,
        })
        .expect(201),
    );
  const get = (id: string, account: ApiAccount = it1) =>
    request(server()).get(`/api/v1/applications/${id}`).set(as(account));
  const patch = (id: string, body: object) =>
    request(server()).patch(`/api/v1/applications/${id}`).set(as(it1)).send(body);
  const warnings = async (): Promise<WarningWire[]> =>
    dataOf<{ items: WarningWire[] }>(
      await request(server()).get('/api/v1/business-owner-warnings').query({ pageSize: 100 }).set(as(it1)).expect(200),
    ).items;
  const history = async (id: string, account: ApiAccount = it1): Promise<PeriodWire[]> =>
    dataOf<{ items: PeriodWire[] }>(
      await request(server()).get(`/api/v1/applications/${id}/business-owners`).set(as(account)).expect(200),
    ).items;
  const auditOf = async (resourceId: string) =>
    (
      await ctx.sql.query<{
        action: string;
        before: { businessOwnerEmployeeId?: string };
        after: { businessOwnerEmployeeId?: string };
      }>('SELECT action, before, after FROM audit_events WHERE resource_id = $1 ORDER BY occurred_at, id', [resourceId])
    ).rows;

  describe('when a Business Owner leaves', () => {
    it('AC-1: lists every application the person owned, and none of the applications of people who still work', async () => {
      const b1 = await person();
      const stays = await person();
      const figma = await application(b1, 'SAAS', 'Figma');
      const jira = await application(b1, 'SAAS', 'Jira');
      const other = await application(stays);
      expect((await warnings()).map((item) => item.applicationId)).not.toContain(figma.id);

      await leaves(b1);
      const listed = await warnings();

      expect(
        listed
          .filter((item) => item.businessOwner.employeeId === b1)
          .map((item) => item.applicationName)
          .sort(),
      ).toEqual(['Figma', 'Jira']);
      expect(listed.map((item) => item.applicationId)).not.toContain(other.id);
      expect(listed.find((item) => item.applicationId === jira.id)?.businessOwner.status).toBe('TERMINATED');
    });

    it('AC-2: the application keeps the person with a flag until a replacement, and the person gets no renewal alert', async () => {
      const b1 = await person();
      const kept = await person();
      const figma = await application(b1);
      const working = await application(kept);
      expect(await lookup.renewalAlertRecipient(figma.id)).toBe(b1);

      await leaves(b1);
      const read = dataOf<ApplicationWire>(await get(figma.id).expect(200));

      expect(read.businessOwner).toMatchObject({ employeeId: b1, status: 'TERMINATED' });
      expect(read.businessOwnerReplacementRequired).toBe(true);
      expect(await lookup.renewalAlertRecipient(figma.id)).toBeNull();
      expect(await lookup.renewalAlertRecipient(working.id)).toBe(kept);
      expect(await lookup.renewalAlertRecipient(randomUUID())).toBeNull();
      const listed = dataOf<{ items: ApplicationWire[] }>(
        await request(server()).get('/api/v1/applications').query({ search: figma.name }).set(as(finance)).expect(200),
      ).items;
      expect(listed[0].businessOwnerReplacementRequired).toBe(true);
    });

    it('AC-3: naming a working replacement ends the alert, changes the owner and closes the old period in the history', async () => {
      const b1 = await person();
      const b2 = await person();
      const figma = await application(b1);
      await leaves(b1);

      const replaced = dataOf<ApplicationWire>(await patch(figma.id, { businessOwnerEmployeeId: b2 }).expect(200));

      expect(replaced.businessOwner.employeeId).toBe(b2);
      expect(replaced.businessOwnerReplacementRequired).toBe(false);
      expect((await warnings()).map((item) => item.applicationId)).not.toContain(figma.id);
      expect(await lookup.renewalAlertRecipient(figma.id)).toBe(b2);
      const periods = await history(figma.id);
      expect(periods.map((period) => [period.employee.employeeId, period.endedAt === null])).toEqual([
        [b2, true],
        [b1, false],
      ]);
      expect(periods[0].assignedBy).toBe(it1.appUserId);
      expect(periods[1].assignedBy).toBe(it1.appUserId);
      const update = (await auditOf(figma.id)).find((event) => event.action === 'APPLICATION.UPDATED');
      expect(update?.before.businessOwnerEmployeeId).toBe(b1);
      expect(update?.after.businessOwnerEmployeeId).toBe(b2);
    });

    it('AC-4: an internal application is warned about like any other', async () => {
      const b4 = await person();
      const portal = await application(b4, 'INTERNAL', 'Cổng báo cáo nội bộ');
      await leaves(b4);

      const entry = (await warnings()).find((item) => item.applicationId === portal.id);

      expect(entry).toMatchObject({ kind: 'INTERNAL', applicationName: 'Cổng báo cáo nội bộ' });
    });

    it('AC-5: a replacement who has left, or who does not exist, is refused and nothing changes', async () => {
      const b1 = await person();
      const b3 = await person(true);
      const figma = await application(b1);
      await leaves(b1);

      expect(codeOf(await patch(figma.id, { businessOwnerEmployeeId: b3 }).expect(422))).toBe(
        'APPLICATION.BUSINESS_OWNER_INVALID',
      );
      expect(codeOf(await patch(figma.id, { businessOwnerEmployeeId: randomUUID() }).expect(422))).toBe(
        'APPLICATION.BUSINESS_OWNER_INVALID',
      );

      const read = dataOf<ApplicationWire>(await get(figma.id).expect(200));
      expect(read.businessOwner.employeeId).toBe(b1);
      expect(read.businessOwnerReplacementRequired).toBe(true);
      expect(await history(figma.id)).toHaveLength(1);
      expect((await warnings()).map((item) => item.applicationId)).toContain(figma.id);
    });

    it('AC-6: an owner who changes department but still works is not flagged, not warned, and stays the owner', async () => {
      const b1 = await person();
      const figma = await application(b1);
      // A department change is a change of placement: the employee status is untouched.
      await ctx.sql.query(`UPDATE employees SET updated_at = now() WHERE id = $1`, [b1]);

      const read = dataOf<ApplicationWire>(await get(figma.id).expect(200));

      expect(read.businessOwner).toMatchObject({ employeeId: b1, status: 'ACTIVE' });
      expect(read.businessOwnerReplacementRequired).toBe(false);
      expect((await warnings()).map((item) => item.applicationId)).not.toContain(figma.id);
    });
  });

  describe('the history of Business Owners', () => {
    it('opens the first period when the application is declared, and a change of anything else opens none', async () => {
      const b1 = await person();
      const figma = await application(b1);

      await patch(figma.id, { name: unique('Renamed') }).expect(200);
      await patch(figma.id, { businessOwnerEmployeeId: b1 }).expect(200);

      const periods = await history(figma.id);
      expect(periods).toHaveLength(1);
      expect(periods[0]).toMatchObject({
        employee: { employeeId: b1, status: 'ACTIVE' },
        endedAt: null,
        assignedBy: it1.appUserId,
      });
    });

    it('keeps one open period per application through several changes, newest first, nothing deleted', async () => {
      const [a, b, c] = [await person(), await person(), await person()];
      const figma = await application(a);

      await patch(figma.id, { businessOwnerEmployeeId: b }).expect(200);
      await patch(figma.id, { businessOwnerEmployeeId: c }).expect(200);

      const periods = await history(figma.id);
      expect(periods.map((period) => period.employee.employeeId)).toEqual([c, b, a]);
      expect(periods.filter((period) => period.endedAt === null)).toHaveLength(1);
      const open = await ctx.sql.query(
        `SELECT 1 FROM application_business_owners WHERE application_id = $1 AND ended_at IS NULL`,
        [figma.id],
      );
      expect(open.rowCount).toBe(1);
      await expect(
        ctx.sql.query(`DELETE FROM application_business_owners WHERE application_id = $1`, [figma.id]),
      ).rejects.toMatchObject({ code: '55000' });
    });

    it('answers 404 for an application that does not exist', async () => {
      expect(
        codeOf(
          await request(server()).get(`/api/v1/applications/${randomUUID()}/business-owners`).set(as(it1)).expect(404),
        ),
      ).toBe('APPLICATION.NOT_FOUND');
    });

    it('pages the alert list by application name', async () => {
      const owner = await person();
      const tag = unique('Paged').replace(' ', '-');
      await application(owner, 'SAAS', `${tag} B`);
      await application(owner, 'SAAS', `${tag} A`);
      await leaves(owner);

      const page = dataOf<{ items: WarningWire[]; pagination: { totalItems: number; pageSize: number } }>(
        await request(server())
          .get('/api/v1/business-owner-warnings')
          .query({ pageSize: 100 })
          .set(as(it1))
          .expect(200),
      );
      const mine = page.items.filter((item) => item.applicationName.startsWith(tag));
      expect(mine.map((item) => item.applicationName)).toEqual([`${tag} A`, `${tag} B`]);
      const one = dataOf<{ items: WarningWire[]; pagination: { pageSize: number } }>(
        await request(server())
          .get('/api/v1/business-owner-warnings')
          .query({ page: 1, pageSize: 1 })
          .set(as(it1))
          .expect(200),
      );
      expect(one.items).toHaveLength(1);
      expect(one.pagination.pageSize).toBe(1);
    });
  });

  describe('who may use it', () => {
    it('lets only the IT Admin read the alerts, and the IT Admin and Finance the history; no one else sees either', async () => {
      const owner = await person();
      const figma = await application(owner);
      const asSuperAdmin = { Authorization: `Bearer ${admin}` };

      await request(server()).get('/api/v1/business-owner-warnings').set(as(finance)).expect(403);
      await request(server()).get('/api/v1/business-owner-warnings').set(as(employee)).expect(403);
      await request(server()).get('/api/v1/business-owner-warnings').set(asSuperAdmin).expect(403);
      expect(await history(figma.id, finance)).toHaveLength(1);
      await request(server()).get(`/api/v1/applications/${figma.id}/business-owners`).set(as(employee)).expect(403);
      await request(server()).get(`/api/v1/applications/${figma.id}/business-owners`).set(asSuperAdmin).expect(403);
    });

    it('does not let Finance, an employee or the Super Admin name a replacement', async () => {
      const b1 = await person();
      const b2 = await person();
      const figma = await application(b1);
      await leaves(b1);
      const asSuperAdmin = { Authorization: `Bearer ${admin}` };

      await request(server())
        .patch(`/api/v1/applications/${figma.id}`)
        .set(as(finance))
        .send({ businessOwnerEmployeeId: b2 })
        .expect(403);
      await request(server())
        .patch(`/api/v1/applications/${figma.id}`)
        .set(as(employee))
        .send({ businessOwnerEmployeeId: b2 })
        .expect(403);
      await request(server())
        .patch(`/api/v1/applications/${figma.id}`)
        .set(asSuperAdmin)
        .send({ businessOwnerEmployeeId: b2 })
        .expect(403);

      expect(dataOf<ApplicationWire>(await get(figma.id).expect(200)).businessOwner.employeeId).toBe(b1);
    });
  });
});
