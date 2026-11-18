import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import {
  DisposableDatabase,
  dropDisposableDatabase,
  migrateDisposableDatabase,
  provisionDisposableDatabase,
} from '../../support/disposable-database';

/** The SQLSTATE a rejected statement carries: the constraint, not the application, said no. */
async function sqlState(sql: Client, text: string, values: unknown[] = []): Promise<string | null> {
  try {
    await sql.query(text, values);

    return null;
  } catch (error) {
    return (error as { code?: string }).code ?? 'unknown';
  }
}

describe('vendors, functional groups and applications (integration, PostgreSQL constraints)', () => {
  let database: DisposableDatabase;
  let sql: Client;
  let organizationId: string;
  let ownerId: string;

  const insertVendor = async (name: string, groupId: string | null = null): Promise<string> => {
    const id = randomUUID();
    await sql.query(
      `INSERT INTO vendors (id, organization_id, name, normalized_name, dictionary_group_id) VALUES ($1, $2, $3, $4, $5)`,
      [id, organizationId, name, name.toLowerCase(), groupId],
    );

    return id;
  };
  const insertGroup = async (name: string): Promise<string> => {
    const id = randomUUID();
    await sql.query(`INSERT INTO vendor_groups (id, name, normalized_name) VALUES ($1, $2, $3)`, [
      id,
      name,
      name.toLowerCase(),
    ]);

    return id;
  };
  const insertLine = async (groupId: string, name: string): Promise<string> => {
    const id = randomUUID();
    await sql.query(`INSERT INTO vendor_service_lines (id, group_id, name, normalized_name) VALUES ($1, $2, $3, $4)`, [
      id,
      groupId,
      name,
      name.toLowerCase(),
    ]);

    return id;
  };

  interface AppInput {
    name?: string;
    kind?: string;
    vendorId?: string | null;
    lineId?: string | null;
    communication?: [boolean, boolean, boolean];
    isCommunicationService?: boolean;
    domains?: string[];
  }
  const insertApp = (input: AppInput) => {
    const [a, b, c] = input.communication ?? [false, false, false];
    const name = input.name ?? `App ${randomUUID()}`;

    return sqlState(
      sql,
      `INSERT INTO applications (id, organization_id, kind, vendor_id, name, normalized_name, dictionary_line_id,
         business_owner_employee_id, data_sensitivity, comm_person_to_person_messaging, comm_calls_or_meetings,
         comm_mailbox, is_communication_service, domains)
       VALUES ($1, $2, $3::"ApplicationKind", $4, $5, $6, $7, $8, 'MEDIUM'::"DataSensitivity", $9, $10, $11, $12, $13)`,
      [
        randomUUID(),
        organizationId,
        input.kind ?? 'SAAS',
        input.vendorId ?? null,
        name,
        name.toLowerCase(),
        input.lineId ?? null,
        ownerId,
        a,
        b,
        c,
        input.isCommunicationService ?? (a || b || c),
        input.domains ?? [],
      ],
    );
  };

  beforeAll(async () => {
    database = await provisionDisposableDatabase();
    await migrateDisposableDatabase(database);
    sql = new Client({ connectionString: database.url });
    await sql.connect();
    organizationId = randomUUID();
    await sql.query(
      `INSERT INTO organizations (id, name, time_zone, reporting_currency) VALUES ($1, 'Acme', 'UTC', 'VND')`,
      [organizationId],
    );
    ownerId = randomUUID();
    await sql.query(
      `INSERT INTO employees (id, organization_id, employee_code, full_name, employment_type, hire_date, updated_at)
       VALUES ($1, $2, 'E-1', 'Owner One', 'STAFF', '2026-01-01', now())`,
      [ownerId, organizationId],
    );
  }, 60000);

  afterAll(async () => {
    await sql?.end();
    if (database) await dropDisposableDatabase(database);
  });

  describe('vendors and functional groups', () => {
    it('refuses a second vendor with the same normalized name and a second vendor for the same dictionary group', async () => {
      await insertVendor('Figma');
      await expect(insertVendor('FIGMA')).rejects.toMatchObject({ code: '23505' });

      const group = await insertGroup('Microsoft');
      await insertVendor('Microsoft Corp', group);
      await expect(insertVendor('Microsoft Ireland', group)).rejects.toMatchObject({ code: '23505' });
      // vendors outside the dictionary may be many
      await insertVendor('Free text one');
      await insertVendor('Free text two');
    });

    it('refuses a second functional group with the same normalized name', async () => {
      const insert = (name: string) =>
        sqlState(
          sql,
          `INSERT INTO functional_groups (id, organization_id, name, normalized_name) VALUES ($1, $2, $3, $4)`,
          [randomUUID(), organizationId, name, name.toLowerCase()],
        );

      expect(await insert('Design')).toBeNull();
      expect(await insert('DESIGN')).toBe('23505');
    });
  });

  describe('applications', () => {
    it('ties the kind to the vendor: only an internal application has none', async () => {
      const vendor = await insertVendor('Kind vendor');

      expect(await insertApp({ kind: 'SAAS', vendorId: vendor })).toBeNull();
      expect(await insertApp({ kind: 'LICENSED', vendorId: vendor })).toBeNull();
      expect(await insertApp({ kind: 'INTERNAL', vendorId: null })).toBeNull();
      expect(await insertApp({ kind: 'SAAS', vendorId: null })).toBe('23514');
      expect(await insertApp({ kind: 'INTERNAL', vendorId: vendor })).toBe('23514');
    });

    it('keeps the communication flag equal to the or of the three answers', async () => {
      const vendor = await insertVendor('Flag vendor');

      expect(await insertApp({ vendorId: vendor, communication: [true, false, false] })).toBeNull();
      expect(await insertApp({ vendorId: vendor, communication: [false, false, true] })).toBeNull();
      expect(await insertApp({ vendorId: vendor, communication: [false, false, false] })).toBeNull();
      expect(
        await insertApp({ vendorId: vendor, communication: [true, true, true], isCommunicationService: false }),
      ).toBe('23514');
      expect(
        await insertApp({ vendorId: vendor, communication: [false, false, false], isCommunicationService: true }),
      ).toBe('23514');
    });

    it('allows at most twenty domains', async () => {
      const vendor = await insertVendor('Domain vendor');
      const many = Array.from({ length: 21 }, (_, index) => `d${index}.example.com`);

      expect(await insertApp({ vendorId: vendor, domains: many.slice(0, 20) })).toBeNull();
      expect(await insertApp({ vendorId: vendor, domains: many })).toBe('23514');
    });

    it('refuses the same normalized name twice for one vendor, and twice among internal applications', async () => {
      const first = await insertVendor('Name vendor one');
      const second = await insertVendor('Name vendor two');

      expect(await insertApp({ name: 'Notion', vendorId: first })).toBeNull();
      expect(await insertApp({ name: 'NOTION', vendorId: first })).toBe('23505');
      expect(await insertApp({ name: 'Notion', vendorId: second })).toBeNull();

      expect(await insertApp({ name: 'Portal', kind: 'INTERNAL' })).toBeNull();
      expect(await insertApp({ name: 'PORTAL', kind: 'INTERNAL' })).toBe('23505');
    });

    it('lets one dictionary line belong to one application only (US-04-07 AC-6)', async () => {
      const group = await insertGroup('Line group');
      const line = await insertLine(group, 'Line one');
      const vendor = await insertVendor('Line vendor', group);

      expect(await insertApp({ name: 'First', vendorId: vendor, lineId: line })).toBeNull();
      expect(await insertApp({ name: 'Second', vendorId: vendor, lineId: line })).toBe('23505');
    });

    it('refuses a dictionary line that is not in the group of the vendor, and one for a vendor with no group, and for an internal one', async () => {
      const group = await insertGroup('Right group');
      const otherGroup = await insertGroup('Other group');
      const line = await insertLine(otherGroup, 'Other line');
      const grouped = await insertVendor('Grouped vendor', group);
      const free = await insertVendor('Ungrouped vendor');

      expect(await insertApp({ vendorId: grouped, lineId: line })).toBe('23514');
      expect(await insertApp({ vendorId: free, lineId: line })).toBe('23514');
      expect(await insertApp({ kind: 'INTERNAL', lineId: line })).toBe('23514');
    });

    it('refuses an unknown business owner, vendor and functional group (foreign keys)', async () => {
      const vendor = await insertVendor('Fk vendor');
      const insert = (overrides: { vendor?: string; owner?: string; functionalGroup?: string | null }) =>
        sqlState(
          sql,
          `INSERT INTO applications (id, organization_id, kind, vendor_id, name, normalized_name, functional_group_id,
             business_owner_employee_id, data_sensitivity, comm_person_to_person_messaging, comm_calls_or_meetings,
             comm_mailbox, is_communication_service)
           VALUES ($1, $2, 'SAAS', $3, $4, $5, $6, $7, 'LOW', false, false, false, false)`,
          [
            randomUUID(),
            organizationId,
            overrides.vendor ?? vendor,
            `Fk app ${randomUUID()}`,
            `fk app ${randomUUID()}`,
            overrides.functionalGroup ?? null,
            overrides.owner ?? ownerId,
          ],
        );

      expect(await insert({})).toBeNull();
      expect(await insert({ vendor: randomUUID() })).toBe('23503');
      expect(await insert({ owner: randomUUID() })).toBe('23503');
      expect(await insert({ functionalGroup: randomUUID() })).toBe('23503');
    });
  });

  describe('proposals raised by an application', () => {
    it('keeps the source application and the proposed domains, at most twenty', async () => {
      const vendor = await insertVendor('Proposal vendor');
      const appId = randomUUID();
      await sql.query(
        `INSERT INTO applications (id, organization_id, kind, vendor_id, name, normalized_name, business_owner_employee_id,
           data_sensitivity, comm_person_to_person_messaging, comm_calls_or_meetings, comm_mailbox, is_communication_service)
         VALUES ($1, $2, 'SAAS', $3, 'Proposed app', 'proposed app', $4, 'LOW', false, false, false, false)`,
        [appId, organizationId, vendor, ownerId],
      );
      const insert = (domains: string[], source: string | null) =>
        sqlState(
          sql,
          `INSERT INTO vendor_dictionary_proposals (id, organization_id, proposed_name, normalized_name, proposed_domains, source_application_id)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [randomUUID(), organizationId, `Prop ${randomUUID()}`, `prop ${randomUUID()}`, domains, source],
        );

      expect(await insert(['x.example.com'], appId)).toBeNull();
      expect(await insert([], null)).toBeNull();
      expect(await insert(['x.example.com'], randomUUID())).toBe('23503');
      expect(
        await insert(
          Array.from({ length: 21 }, (_, index) => `d${index}.example.com`),
          appId,
        ),
      ).toBe('23514');
    });
  });
});
