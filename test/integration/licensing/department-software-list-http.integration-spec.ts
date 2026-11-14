import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { RequestHarness, type Department, type Person } from '../../support/request-harness';

const h = new RequestHarness();

interface EntryWire {
  entryId: string;
  applicationId: string;
  applicationName: string;
  planId: string | null;
  planName: string | null;
  note: string | null;
  addedAt: string;
}
interface ListWire {
  departmentId: string | null;
  items: EntryWire[];
  pagination: { page: number; pageSize: number; totalItems: number; totalPages: number };
}
interface Place {
  applicationId: string;
  planId: string;
}

/**
 * DS.2 (`QĐ-110s`, SPEC P16, P17, T-IT): the list of software of a department over HTTP, on real PostgreSQL. The people of the department, its
 * head, every IT Admin and the Super Admin read it; a person of another department does not; only the IT Admin in charge changes it, in one
 * transaction that refuses the whole call for a place outside the catalog, one already listed or an entry that is not in the department.
 */
describe('the list of software of a department over HTTP (integration, real PostgreSQL)', () => {
  let design: Department;
  let finance: Department;
  let orphan: Department;
  let designHead: Person;
  let designMember: Person;
  let financeMember: Person;
  let financeHead: Person;
  let designIt: Person;
  let financeIt: Person;
  let nobody: Person;
  let counter = 0;

  const listOf = (departmentId: string, who: Record<string, string>, query: object = {}) =>
    request(h.server()).get(`/api/v1/departments/${departmentId}/software-list`).query(query).set(who);
  const mine = (who: Record<string, string>, query: object = {}) =>
    request(h.server()).get('/api/v1/me/department-software-list').query(query).set(who);
  const change = (departmentId: string, who: Record<string, string>, body: object) =>
    request(h.server()).post(`/api/v1/departments/${departmentId}/software-list/changes`).set(who).send(body);
  const admin = () => ({ Authorization: `Bearer ${h.admin}` });
  const ids = (list: ListWire) => list.items.map((item) => item.entryId);
  const rows = async (departmentId: string): Promise<number> =>
    (await h.ctx.sql.query('SELECT 1 FROM department_software_entries WHERE department_id = $1', [departmentId])).rows
      .length;

  /** A plan of a new application, with the application it belongs to. */
  const place = async (): Promise<Place> => {
    const planId = await h.plan('K1');
    const { rows: found } = await h.ctx.sql.query<{ application_id: string }>(
      'SELECT application_id FROM plans WHERE id = $1',
      [planId],
    );

    return { applicationId: found[0].application_id, planId };
  };

  beforeAll(async () => {
    await h.start();
    design = await h.departmentWithUnit('P-DSL-D');
    finance = await h.departmentWithUnit('P-DSL-F');
    orphan = await h.departmentWithUnit('P-DSL-O');
    designHead = await h.staff(design, 'DSL-D-H');
    designMember = await h.staff(design, 'DSL-D-M');
    financeHead = await h.staff(finance, 'DSL-F-H');
    financeMember = await h.staff(finance, 'DSL-F-M');
    designIt = await h.staff(design, 'DSL-D-IT', 'IT_ADMIN');
    financeIt = await h.staff(finance, 'DSL-F-IT', 'IT_ADMIN');
    nobody = await h.unplacedStaff('DSL-NOBODY');
    await h.makeHead(design, designHead);
    await h.makeHead(finance, financeHead);
    await h.setItAdminInCharge(design, designIt);
    await h.setItAdminInCharge(finance, financeIt);
  }, 300000);

  afterAll(async () => {
    await h.stop();
  });

  describe('reading the list of a department (P16)', () => {
    it('is open to a person of the department, its head, every IT Admin and the Super Admin, and shows the words of each place', async () => {
      const { applicationId, planId } = await place();
      await change(design.id, h.as(designIt.account), {
        add: [{ applicationId, planId, note: 'for the designers' }, { applicationId }],
      }).expect(200);

      for (const who of [
        h.as(designMember.account),
        h.as(designHead.account),
        h.as(designIt.account),
        h.as(financeIt.account),
        h.as(h.it1),
        admin(),
      ]) {
        const list = h.dataOf<ListWire>(await listOf(design.id, who).expect(200));
        expect(list.departmentId).toBe(design.id);
        expect(list.items.filter((item) => item.applicationId === applicationId)).toHaveLength(2);
      }
      const list = h.dataOf<ListWire>(await listOf(design.id, h.as(designMember.account)).expect(200));
      const withPlan = list.items.find((item) => item.planId === planId);
      const names = await h.ctx.sql.query<{ application: string; plan: string }>(
        'SELECT a.name AS application, p.name AS plan FROM plans p JOIN applications a ON a.id = p.application_id WHERE p.id = $1',
        [planId],
      );
      expect(withPlan?.applicationName).toBe(names.rows[0].application);
      expect(withPlan?.planName).toBe(names.rows[0].plan);
      expect(withPlan?.note).toBe('for the designers');
      expect(withPlan?.addedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(
        list.items.find((item) => item.applicationId === applicationId && item.planId === null)?.planName,
      ).toBeNull();
    });

    it('keeps out a person of another department, the head of another, and an account placed nowhere: 403', async () => {
      for (const who of [
        h.as(financeMember.account),
        h.as(financeHead.account),
        h.as(nobody.account),
        h.as(h.finance),
      ]) {
        const response = await listOf(design.id, who).expect(403);
        expect(h.codeOf(response)).toBe('DEPARTMENT.OUT_OF_SCOPE');
      }
    });

    it('answers 404 for a department that does not exist, and 422 for an id that is not one', async () => {
      expect(h.codeOf(await listOf(randomUUID(), admin()).expect(404))).toBe('DEPARTMENT.NOT_FOUND');
      await listOf('not-a-uuid', admin()).expect(422);
    });

    it('pages newest first and then by id, the same pages twice, and the total of the whole list', async () => {
      for (let index = 0; index < 3; index += 1) {
        const { applicationId } = await place();
        await change(finance.id, h.as(financeIt.account), { add: [{ applicationId }] }).expect(200);
      }

      const first = h.dataOf<ListWire>(
        await listOf(finance.id, h.as(financeMember.account), { page: 1, pageSize: 2 }).expect(200),
      );
      const second = h.dataOf<ListWire>(
        await listOf(finance.id, h.as(financeMember.account), { page: 2, pageSize: 2 }).expect(200),
      );
      const again = h.dataOf<ListWire>(
        await listOf(finance.id, h.as(financeMember.account), { page: 1, pageSize: 2 }).expect(200),
      );

      expect(first.pagination).toEqual({ page: 1, pageSize: 2, totalItems: 3, totalPages: 2 });
      expect(first.items).toHaveLength(2);
      expect(second.items).toHaveLength(1);
      expect(ids(again)).toEqual(ids(first));
      expect(new Set([...ids(first), ...ids(second)]).size).toBe(3);
      const added = [...first.items, ...second.items].map((item) => new Date(item.addedAt).getTime());
      expect(added).toEqual([...added].sort((a, b) => b - a));
    });
  });

  describe('the list of my department (P17)', () => {
    it('is the list of the department the caller is placed in, and nobody names another', async () => {
      const { applicationId } = await place();
      await change(orphan.id, h.as(h.it1), { add: [{ applicationId }] }).expect(200);
      const inOrphan = await h.staff(orphan, 'DSL-O-M');

      const own = h.dataOf<ListWire>(await mine(h.as(inOrphan.account)).expect(200));
      const designs = h.dataOf<ListWire>(await mine(h.as(designMember.account)).expect(200));

      expect(own.departmentId).toBe(orphan.id);
      expect(own.items.map((item) => item.applicationId)).toEqual([applicationId]);
      expect(designs.departmentId).toBe(design.id);
      expect(designs.items.some((item) => item.applicationId === applicationId)).toBe(false);
      await mine(h.as(designMember.account), { departmentId: orphan.id }).expect(422);
    });

    it('answers an empty page and no department for an account placed nowhere', async () => {
      const list = h.dataOf<ListWire>(await mine(h.as(nobody.account)).expect(200));

      expect(list).toEqual({
        departmentId: null,
        items: [],
        pagination: { page: 1, pageSize: 50, totalItems: 0, totalPages: 0 },
      });
    });
  });

  describe('changing the list (P16)', () => {
    it('is the IT Admin in charge of the department only: another department’s IT Admin and an IT Admin of no department are refused 403 and nothing is written', async () => {
      const { applicationId } = await place();
      const before = await rows(design.id);

      for (const who of [h.as(financeIt.account), h.as(h.it1)]) {
        const response = await change(design.id, who, { add: [{ applicationId }] }).expect(403);
        expect(h.codeOf(response)).toBe('DEPARTMENT.OUT_OF_SCOPE');
      }
      expect(await rows(design.id)).toBe(before);
    });

    it('falls to every IT Admin while nobody who can act is in charge of the department', async () => {
      const { applicationId } = await place();
      const bare = await h.departmentWithUnit(`P-DSL-N${(counter += 1)}`);

      await change(bare.id, h.as(financeIt.account), { add: [{ applicationId }] }).expect(200);
      await change(bare.id, h.as(h.it1), { add: [{ applicationId, planId: null }] }).expect(409);
    });

    it('writes places and answers them with their ids, one event of the Audit Trail for each', async () => {
      const { applicationId, planId } = await place();

      const done = h.dataOf<{ added: EntryWire[]; removed: string[] }>(
        await change(design.id, h.as(designIt.account), {
          add: [
            { applicationId, planId },
            { applicationId, note: 'whole suite' },
          ],
        }).expect(200),
      );

      expect(done.removed).toEqual([]);
      expect(done.added).toHaveLength(2);
      const { rows: events } = await h.ctx.sql.query<{ action: string; resource_id: string }>(
        `SELECT action, resource_id FROM audit_events WHERE action LIKE 'DEPARTMENT_SOFTWARE.%' AND resource_id = ANY($1::text[])`,
        [done.added.map((entry) => entry.entryId)],
      );
      expect(events.map((event) => event.action)).toEqual([
        'DEPARTMENT_SOFTWARE.ENTRY_ADDED',
        'DEPARTMENT_SOFTWARE.ENTRY_ADDED',
      ]);
    });

    it('refuses a place that is already listed with 409 and writes none of the call, the new ones included', async () => {
      const taken = await place();
      const fresh = await place();
      await change(design.id, h.as(designIt.account), { add: [{ applicationId: taken.applicationId }] }).expect(200);
      const before = await rows(design.id);

      const response = await change(design.id, h.as(designIt.account), {
        add: [{ applicationId: fresh.applicationId }, { applicationId: taken.applicationId, planId: null }],
      }).expect(409);

      expect(h.codeOf(response)).toBe('DEPARTMENT_SOFTWARE.ALREADY_LISTED');
      expect(h.detailsOf(response).places).toEqual([{ applicationId: taken.applicationId, planId: null }]);
      expect(await rows(design.id)).toBe(before);
    });

    it('refuses what the catalog does not offer with 422 naming every place: an unknown application, a retired one, a plan of another application', async () => {
      const one = await place();
      const two = await place();
      const retired = await place();
      await h.ctx.sql.query(`UPDATE applications SET catalog_status = 'RETIRED', retired_at = now() WHERE id = $1`, [
        retired.applicationId,
      ]);
      const before = await rows(design.id);
      const outside = [
        { applicationId: randomUUID() },
        { applicationId: retired.applicationId },
        { applicationId: one.applicationId, planId: two.planId },
      ];

      const response = await change(design.id, h.as(designIt.account), {
        add: [{ applicationId: one.applicationId, planId: one.planId }, ...outside],
      }).expect(422);

      expect(h.codeOf(response)).toBe('DEPARTMENT_SOFTWARE.NOT_IN_CATALOG');
      expect(h.detailsOf(response).places).toEqual(
        outside.map((item) => ({
          applicationId: item.applicationId,
          planId: (item as { planId?: string }).planId ?? null,
        })),
      );
      expect(await rows(design.id)).toBe(before);
    });

    it('takes entries out, refuses an entry of another department with 404 and takes none of the call', async () => {
      const mineToo = await place();
      const theirs = await place();
      const ours = h.dataOf<{ added: EntryWire[] }>(
        await change(design.id, h.as(designIt.account), { add: [{ applicationId: mineToo.applicationId }] }).expect(
          200,
        ),
      ).added[0];
      const other = h.dataOf<{ added: EntryWire[] }>(
        await change(finance.id, h.as(financeIt.account), { add: [{ applicationId: theirs.applicationId }] }).expect(
          200,
        ),
      ).added[0];

      const refused = await change(design.id, h.as(designIt.account), { remove: [ours.entryId, other.entryId] }).expect(
        404,
      );
      expect(h.codeOf(refused)).toBe('DEPARTMENT_SOFTWARE.ENTRY_NOT_FOUND');
      expect(h.detailsOf(refused).entryIds).toEqual([other.entryId]);
      expect(ids(h.dataOf<ListWire>(await listOf(design.id, admin(), { pageSize: 100 }).expect(200)))).toContain(
        ours.entryId,
      );

      const done = h.dataOf<{ removed: string[] }>(
        await change(design.id, h.as(designIt.account), { remove: [ours.entryId] }).expect(200),
      );
      expect(done.removed).toEqual([ours.entryId]);
      expect(ids(h.dataOf<ListWire>(await listOf(design.id, admin(), { pageSize: 100 }).expect(200)))).not.toContain(
        ours.entryId,
      );
      expect(ids(h.dataOf<ListWire>(await listOf(finance.id, admin(), { pageSize: 100 }).expect(200)))).toContain(
        other.entryId,
      );
      await change(design.id, h.as(designIt.account), { remove: [ours.entryId] }).expect(404);
    });

    it('replaces a place with a new note in one call: the entry goes out first, then the place comes in', async () => {
      const here = await place();
      const first = h.dataOf<{ added: EntryWire[] }>(
        await change(design.id, h.as(designIt.account), {
          add: [{ applicationId: here.applicationId, note: 'old' }],
        }).expect(200),
      ).added[0];

      const done = h.dataOf<{ added: EntryWire[]; removed: string[] }>(
        await change(design.id, h.as(designIt.account), {
          remove: [first.entryId],
          add: [{ applicationId: here.applicationId, note: 'new' }],
        }).expect(200),
      );

      expect(done.removed).toEqual([first.entryId]);
      expect(done.added.map((entry) => entry.note)).toEqual(['new']);
      expect(done.added[0].entryId).not.toBe(first.entryId);
    });

    it('leaves one entry and one conflict when two IT Admins add the same place together', async () => {
      const here = await place();
      const bare = await h.departmentWithUnit(`P-DSL-R${(counter += 1)}`);

      const answers = await Promise.all([
        change(bare.id, h.as(financeIt.account), { add: [{ applicationId: here.applicationId }] }),
        change(bare.id, h.as(h.it1), { add: [{ applicationId: here.applicationId }] }),
      ]);

      expect(answers.map((answer) => answer.status).sort()).toEqual([200, 409]);
      expect(await rows(bare.id)).toBe(1);
    });
  });
});
