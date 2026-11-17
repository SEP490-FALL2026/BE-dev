import request from 'supertest';
import type { ApiAccount } from '../../support/api-accounts';
import { createDepartment, enterEmployee } from '../../support/builders/organization.builder';
import { pretendBusinessToday } from '../../support/pretend-today';
import { USAGE_TODAY, UsageOverviewHarness } from '../../support/usage-overview-harness';

const h = new UsageOverviewHarness();

interface MappingWire {
  employeeId: string;
  employeeCode: string | null;
  identifier: string;
}
interface FindingWire {
  employeeId: string;
  employeeCode: string | null;
}
interface PageWire<T> {
  items: T[];
  pagination: { totalItems: number };
}

/**
 * Whose identity mappings and no-seat findings an IT Admin reads (`QĐ-111ax`, FX-T6b): the people of the departments in their charge and of a
 * department with no IT Admin, never of another IT Admin's; the queue of identifiers nobody was tied to (`Q-5A-2` = A) is for every IT Admin.
 * The world: `P1` (`it1`), `P2` (`it2`) and `P3` (nobody in charge), a person in each, all active in a vendor report with no seat, and a stranger.
 */
describe('the identity mappings and findings by department of the IT Admin (integration, real PostgreSQL)', () => {
  let applicationId: string;
  let p1: string;
  let p2: string;
  let p3: string;

  beforeAll(async () => {
    await h.startTwoDepartments();
    pretendBusinessToday(h.ctx.app, USAGE_TODAY);
    ({ applicationId } = await h.usageApp());
    p1 = await h.person('SC-P1');
    p2 = await h.personOfOtherDepartment('SC-P2');
    const third = await createDepartment(h.ctx, h.admin, { code: 'P-THIRD', name: 'Department without an IT Admin' });
    const hireDate = '2026-01-05';
    ({ id: p3 } = await enterEmployee(h.ctx, h.admin, {
      employeeCode: 'SC-P3',
      fullName: 'Person SC-P3',
      workEmail: 'sc-p3@acme.vn',
      employmentType: 'STAFF',
      hireDate,
      departmentCode: third.code,
      jobTitle: 'Tester',
    }));
    await h.ctx.sql.query(`UPDATE employee_placements SET valid_from = $2 WHERE employee_id = $1`, [p3, hireDate]);
    const source = await h.source(applicationId);
    await h.confirmed(
      source.id,
      h.report(
        ['email', 'last_active'],
        [
          ['sc-p1@acme.vn', '2026-11-05'],
          ['sc-p2@acme.vn', '2026-11-06'],
          ['sc-p3@acme.vn', '2026-11-07'],
          ['stranger-scope@vendor.example', '2026-11-08'],
        ],
      ),
      { coverageFrom: '2026-11-01', coverageTo: '2026-11-10' },
    );
  }, 300000);

  afterAll(async () => {
    await h.stop();
  });

  const read = async <T>(path: string, query: Record<string, string>, account: ApiAccount): Promise<PageWire<T>> =>
    h.dataOf<PageWire<T>>(
      await request(h.server())
        .get(`/api/v1/${path}`)
        .query({ applicationId, pageSize: '100', ...query })
        .set(h.as(account))
        .expect(200),
    );
  const mappingCodes = async (account: ApiAccount, query: Record<string, string> = {}): Promise<string[]> =>
    (await read<MappingWire>('usage-identity-mappings', query, account)).items
      .map((item) => item.employeeCode ?? '')
      .sort();
  const findingCodes = async (account: ApiAccount): Promise<string[]> =>
    (await read<FindingWire>('usage-no-assignment-findings', {}, account)).items
      .map((item) => item.employeeCode ?? '')
      .sort();

  it('lists the mappings of the people of the department in charge and of the department with no IT Admin, not of the other IT Admin', async () => {
    expect(await mappingCodes(h.it1)).toEqual(['SC-P1', 'SC-P3']);
    expect(await mappingCodes(h.it2)).toEqual(['SC-P2', 'SC-P3']);
  });

  it('lists the findings of the people of the department in charge and of the department with no IT Admin, not of the other IT Admin', async () => {
    expect(await findingCodes(h.it1)).toEqual(['SC-P1', 'SC-P3']);
    expect(await findingCodes(h.it2)).toEqual(['SC-P2', 'SC-P3']);
  });

  it('answers an empty page, not an error, when the person of a mapping filter is outside the scope, and the mapping when inside', async () => {
    for (const [account, outside, inside] of [
      [h.it1, p2, p1],
      [h.it2, p1, p2],
    ] as const) {
      expect(await mappingCodes(account, { employeeId: outside })).toEqual([]);
      expect(
        (await read<MappingWire>('usage-identity-mappings', { employeeId: outside }, account)).pagination,
      ).toMatchObject({
        totalItems: 0,
      });
      expect(await mappingCodes(account, { employeeId: inside })).toHaveLength(1);
    }
  });

  it('pages over the people in scope only: the total counts what the IT Admin may read', async () => {
    const page = await read<MappingWire>('usage-identity-mappings', { pageSize: '1' }, h.it1);

    expect(page.items).toHaveLength(1);
    expect(page.pagination.totalItems).toBe(2);
  });

  it('QĐ-101i: the queue of identifiers nobody was tied to stays whole for every IT Admin (Q-5A-2 = A)', async () => {
    for (const account of [h.it1, h.it2]) {
      const queue = await read<{ identifier: string }>('usage-unmatched-identities', {}, account);

      expect(queue.items.map((item) => item.identifier)).toEqual(['stranger-scope@vendor.example']);
    }
  });

  // Last on purpose: it ends the placement of `SC-P1` for the rest of the file.
  it('O-01: reads the mappings of a person who has left by the last department, for the IT Admin in charge of it and nobody else', async () => {
    await h.ctx.sql.query(
      `UPDATE employee_placements SET valid_to = DATE '2026-06-01' WHERE employee_id = $1 AND valid_to IS NULL`,
      [p1],
    );

    expect(await mappingCodes(h.it1, { employeeId: p1 })).toEqual(['SC-P1']);
    expect(await mappingCodes(h.it2, { employeeId: p1 })).toEqual([]);
    // The list nobody was asked for in particular stays that of the people placed today.
    expect(await mappingCodes(h.it1)).toEqual(['SC-P3']);
  });
});
