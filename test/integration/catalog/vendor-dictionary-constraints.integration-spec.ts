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

describe('vendor dictionary tables (integration, PostgreSQL constraints)', () => {
  let database: DisposableDatabase;
  let sql: Client;
  let organizationId: string;

  const insertGroup = async (name: string, normalized = name.toLowerCase()): Promise<string> => {
    const id = randomUUID();
    await sql.query(`INSERT INTO vendor_groups (id, name, normalized_name) VALUES ($1, $2, $3)`, [
      id,
      name,
      normalized,
    ]);

    return id;
  };
  const insertLine = (groupId: string, name: string, normalized = name.toLowerCase(), domains: string[] = []) =>
    sqlState(
      sql,
      `INSERT INTO vendor_service_lines (id, group_id, name, normalized_name, domains) VALUES ($1, $2, $3, $4, $5)`,
      [randomUUID(), groupId, name, normalized, domains],
    );
  const insertProposal = (name: string, status: string, resolvedAt: string | null, lineId: string | null = null) =>
    sqlState(
      sql,
      `INSERT INTO vendor_dictionary_proposals (id, organization_id, proposed_name, normalized_name, status, resolved_at, resolved_line_id)
       VALUES ($1, $2, $3, $4, $5::"VendorProposalStatus", $6, $7)`,
      [randomUUID(), organizationId, name, name.toLowerCase(), status, resolvedAt, lineId],
    );

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
  }, 60000);

  afterAll(async () => {
    await sql?.end();
    if (database) await dropDisposableDatabase(database);
  });

  it('refuses a second group with the same normalized name', async () => {
    await insertGroup('Figma');

    await expect(insertGroup('FIGMA', 'figma')).rejects.toMatchObject({ code: '23505' });
  });

  it('refuses a second line with the same normalized name in a group, and allows it in another group', async () => {
    const microsoft = await insertGroup('Microsoft');
    const other = await insertGroup('Other');

    expect(await insertLine(microsoft, 'Azure')).toBeNull();
    expect(await insertLine(microsoft, 'AZURE', 'azure')).toBe('23505');
    expect(await insertLine(other, 'Azure')).toBeNull();
  });

  it('refuses more than twenty domains on a line or on a group', async () => {
    const group = await insertGroup('Many');
    const many = Array.from({ length: 21 }, (_, index) => `d${index}.example.com`);

    expect(await insertLine(group, 'Wide', 'wide', many)).toBe('23514');
    expect(
      await sqlState(
        sql,
        `INSERT INTO vendor_groups (id, name, normalized_name, brand_domains) VALUES ($1, 'W', 'w', $2)`,
        [randomUUID(), many],
      ),
    ).toBe('23514');
  });

  describe('proposals', () => {
    it('keeps status and resolution consistent: only a pending one has no resolution time, only an accepted one has a line', async () => {
      const group = await insertGroup('Proposals');
      const lineId = randomUUID();
      await sql.query(
        `INSERT INTO vendor_service_lines (id, group_id, name, normalized_name) VALUES ($1, $2, 'L', 'l')`,
        [lineId, group],
      );

      expect(await insertProposal('Open one', 'PENDING', null)).toBeNull();
      expect(await insertProposal('Bad pending', 'PENDING', '2026-10-20T00:00:00Z')).toBe('23514');
      expect(await insertProposal('Bad dismissed', 'DISMISSED', null)).toBe('23514');
      expect(await insertProposal('Bad accepted', 'ACCEPTED', '2026-10-20T00:00:00Z')).toBe('23514');
      expect(await insertProposal('Line on dismissed', 'DISMISSED', '2026-10-20T00:00:00Z', lineId)).toBe('23514');
      expect(await insertProposal('Good dismissed', 'DISMISSED', '2026-10-20T00:00:00Z')).toBeNull();
      expect(await insertProposal('Good accepted', 'ACCEPTED', '2026-10-20T00:00:00Z', lineId)).toBeNull();
    });

    it('allows one open proposal per organization and name, and a new one once the old one is resolved', async () => {
      expect(await insertProposal('Notion', 'PENDING', null)).toBeNull();
      expect(await insertProposal('NOTION', 'PENDING', null)).toBe('23505');

      await sql.query(
        `UPDATE vendor_dictionary_proposals SET status = 'DISMISSED', resolved_at = now() WHERE normalized_name = 'notion'`,
      );

      expect(await insertProposal('Notion', 'PENDING', null)).toBeNull();
    });
  });
});
