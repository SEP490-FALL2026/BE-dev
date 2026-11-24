import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { PrismaService } from '../../../src/infrastructure/database/prisma.service';
import { CatalogPlanTermsApi } from '../../../src/modules/catalog/public/catalog-plan-terms.api';
import { PlanTermsRepo } from '../../../src/modules/catalog/plan-terms/plan-terms.repo';
import {
  type DisposableDatabase,
  dropDisposableDatabase,
  migrateDisposableDatabase,
  provisionDisposableDatabase,
} from '../../support/disposable-database';
import { testConfig } from '../../support/test-config';

/** Redesign wave 2, S-22: a key entered without a cap of its own takes the numeric install limit of the terms of its plan. */
describe('the install limit of a plan, read for another module (integration, real PostgreSQL)', () => {
  let database: DisposableDatabase;
  let sql: Client;
  let prisma: PrismaService;
  let api: CatalogPlanTermsApi;
  const org = randomUUID();
  const withLimit = randomUUID();
  const withoutLimit = randomUUID();
  const withoutTerms = randomUUID();

  beforeAll(async () => {
    database = await provisionDisposableDatabase();
    await migrateDisposableDatabase(database);
    sql = new Client({ connectionString: database.url });
    await sql.connect();
    prisma = new PrismaService(testConfig({ DATABASE_URL: database.url }));
    api = new CatalogPlanTermsApi(new PlanTermsRepo(prisma));
    const owner = randomUUID();
    const vendor = randomUUID();
    const application = randomUUID();
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
    await sql.query(
      `INSERT INTO applications (id, organization_id, kind, vendor_id, name, normalized_name, business_owner_employee_id,
         data_sensitivity, comm_person_to_person_messaging, comm_calls_or_meetings, comm_mailbox, is_communication_service)
       VALUES ($1, $2, 'LICENSED', $3, 'AutoCAD', 'autocad', $4, 'LOW', false, false, false, false)`,
      [application, org, vendor, owner],
    );
    for (const [id, name] of [
      [withLimit, 'With a limit'],
      [withoutLimit, 'Without a limit'],
      [withoutTerms, 'Without terms'],
    ]) {
      await sql.query(
        `INSERT INTO plans (id, organization_id, application_id, name, normalized_name, provisioning_type, control_level, key_binding)
         VALUES ($1, $2, $3, $4, lower($4), 'K4', 'FULL', 'DEVICE_KEY')`,
        [id, org, application, name],
      );
    }
    await sql.query(`INSERT INTO plan_terms (plan_id, install_limit_max_devices) VALUES ($1, 3)`, [withLimit]);
    await sql.query(`INSERT INTO plan_terms (plan_id) VALUES ($1)`, [withoutLimit]);
  }, 240000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await sql?.end();
    if (database) await dropDisposableDatabase(database);
  });

  it('gives the numeric limit the terms of the plan record', async () => {
    expect(await api.installLimitOf(withLimit)).toBe(3);
  });

  it('gives null when the terms set no numeric limit, or the plan has no terms, or there is no such plan', async () => {
    expect(await api.installLimitOf(withoutLimit)).toBeNull();
    expect(await api.installLimitOf(withoutTerms)).toBeNull();
    expect(await api.installLimitOf(randomUUID())).toBeNull();
  });
});
