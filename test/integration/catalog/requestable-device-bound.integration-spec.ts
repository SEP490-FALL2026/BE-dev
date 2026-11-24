import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { PrismaService } from '../../../src/infrastructure/database/prisma.service';
import { RequestableSoftwareRepo } from '../../../src/modules/catalog/requestable-software/requestable-software.repo';
import {
  type DisposableDatabase,
  dropDisposableDatabase,
  migrateDisposableDatabase,
  provisionDisposableDatabase,
} from '../../support/disposable-database';
import { testConfig } from '../../support/test-config';

/**
 * Redesign wave 2, W2-18 (b): software that goes on a machine, by a key or bundled with it, is not asked for in "Xin phần mềm". The
 * catalog a person picks from lists only the plans bound to an account (or of a kind that has no binding), and an application that has only
 * plans bound to a machine is not offered at all.
 */
describe('the software a person may request, and the plans bound to a machine (integration, real PostgreSQL)', () => {
  let database: DisposableDatabase;
  let sql: Client;
  let prisma: PrismaService;
  let repo: RequestableSoftwareRepo;
  const org = randomUUID();
  const owner = randomUUID();
  const vendor = randomUUID();
  const ids = {
    autocad: { app: randomUUID(), deviceKey: randomUUID() },
    windows: { app: randomUUID(), bundled: randomUUID() },
    office: { app: randomUUID(), account: randomUUID(), deviceKey: randomUUID() },
    figma: { app: randomUUID(), seats: randomUUID() },
  };
  const page = { skip: 0, take: 50 };

  const application = (id: string, name: string, kind: 'LICENSED' | 'SAAS') =>
    sql.query(
      `INSERT INTO applications (id, organization_id, kind, vendor_id, name, normalized_name, business_owner_employee_id,
         data_sensitivity, comm_person_to_person_messaging, comm_calls_or_meetings, comm_mailbox, is_communication_service)
       VALUES ($1, $2, $3::"ApplicationKind", $4, $5, lower($5), $6, 'LOW', false, false, false, false)`,
      [id, org, kind, vendor, name, owner],
    );
  const plan = (id: string, applicationId: string, name: string, type: 'K2' | 'K4', binding: string | null) =>
    sql.query(
      `INSERT INTO plans (id, organization_id, application_id, name, normalized_name, provisioning_type, pricing_model, control_level, key_binding)
       VALUES ($1, $2, $3, $4, lower($4), $5::"ProvisioningType", $6::"PricingModel", 'FULL', $7::"PlanKeyBinding")`,
      [id, org, applicationId, name, type, type === 'K2' ? 'PER_SEAT' : null, binding],
    );

  beforeAll(async () => {
    database = await provisionDisposableDatabase();
    await migrateDisposableDatabase(database);
    sql = new Client({ connectionString: database.url });
    await sql.connect();
    prisma = new PrismaService(testConfig({ DATABASE_URL: database.url }));
    repo = new RequestableSoftwareRepo(prisma);
    await sql.query(
      `INSERT INTO organizations (id, name, time_zone, reporting_currency) VALUES ($1, 'Acme', 'UTC', 'VND')`,
      [org],
    );
    await sql.query(
      `INSERT INTO employees (id, organization_id, employee_code, full_name, employment_type, hire_date, updated_at)
       VALUES ($1, $2, 'E-OWN', 'Owner', 'STAFF', '2026-01-01', now())`,
      [owner, org],
    );
    await sql.query(`INSERT INTO vendors (id, organization_id, name, normalized_name) VALUES ($1, $2, 'V', 'v')`, [
      vendor,
      org,
    ]);
    await application(ids.autocad.app, 'AutoCAD 2026', 'LICENSED');
    await plan(ids.autocad.deviceKey, ids.autocad.app, 'Per machine', 'K4', 'DEVICE_KEY');
    await application(ids.windows.app, 'Windows 11 Pro OEM', 'LICENSED');
    await plan(ids.windows.bundled, ids.windows.app, 'With the laptop', 'K4', 'DEVICE_BUNDLED');
    await application(ids.office.app, 'Office', 'LICENSED');
    await plan(ids.office.account, ids.office.app, 'Per person', 'K4', 'ACCOUNT');
    await plan(ids.office.deviceKey, ids.office.app, 'Per machine', 'K4', 'DEVICE_KEY');
    await application(ids.figma.app, 'Figma', 'SAAS');
    await plan(ids.figma.seats, ids.figma.app, 'Organization', 'K2', null);
  }, 240000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await sql?.end();
    if (database) await dropDisposableDatabase(database);
  });

  describe('the applications', () => {
    it('does not offer an application that has only plans bound to a machine', async () => {
      const { items, total } = await repo.listApplications(page);

      expect(items.map((item) => item.name).sort()).toEqual(['Figma', 'Office']);
      expect(total).toBe(2);
    });

    it('counts only the plans a person may ask for among the plans of an application', async () => {
      const { items } = await repo.listApplications(page);

      expect(Object.fromEntries(items.map((item) => [item.name, item.planCount]))).toEqual({ Figma: 1, Office: 1 });
    });

    it('does not give the detail of an application that has only plans bound to a machine', async () => {
      expect(await repo.findApplication(ids.autocad.app)).toBeNull();
      expect(await repo.findApplication(ids.windows.app)).toBeNull();
      expect(await repo.findApplication(ids.office.app)).toMatchObject({ name: 'Office', planCount: 1 });
    });
  });

  describe('the plans', () => {
    it('lists the plans bound to an account and those of a kind with no binding, and none bound to a machine', async () => {
      const { items, total } = await repo.listPlans(page);

      expect(items.map((item) => item.id).sort()).toEqual([ids.figma.seats, ids.office.account].sort());
      expect(total).toBe(2);
    });

    it('lists no plan of an application that has only plans bound to a machine', async () => {
      expect((await repo.listPlans({ ...page, applicationId: ids.autocad.app })).items).toEqual([]);
      expect((await repo.listPlans({ ...page, applicationId: ids.windows.app })).items).toEqual([]);
      expect((await repo.listPlans({ ...page, applicationId: ids.office.app })).items.map((item) => item.id)).toEqual([
        ids.office.account,
      ]);
    });

    it('does not give the detail of a plan bound to a machine, and gives the plan of an account as before', async () => {
      expect(await repo.findPlan(ids.autocad.deviceKey)).toBeNull();
      expect(await repo.findPlan(ids.windows.bundled)).toBeNull();
      expect(await repo.findPlan(ids.office.deviceKey)).toBeNull();
      expect(await repo.findPlan(ids.office.account)).toMatchObject({ id: ids.office.account });
      expect(await repo.findPlan(ids.figma.seats)).toMatchObject({ id: ids.figma.seats });
    });
  });
});
