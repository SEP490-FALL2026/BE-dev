import type { Person } from '../../support/request-harness';
import { MONDAY, SaasIssueHarness } from '../../support/saas-issue-harness';

const h = new SaasIssueHarness();

interface Row {
  id: string;
  state: string;
  title: string;
  department: { id: string; name: string } | null;
  plan: { planName: string; applicationName: string; logoUrl: string | null };
  reporter: { employeeId: string };
  assignedItAdmin: { employeeId: string };
}
interface Page {
  items: Row[];
  pagination: { totalItems: number };
}

/**
 * The reports of errors in SaaS rights as an IT Admin reads them by department (`QĐ-111s`, `IA-1`): each row says the department of the
 * reporter and a title (the first line of what they wrote), the list can be cut to one department of the IT Admin, and an IT Admin who is not
 * the one in charge still reads and moves the report. A department outside the ones the IT Admin works answers an empty page (D8).
 */
describe('the reports of SaaS errors by department (integration, real PostgreSQL)', () => {
  let it1: Person;
  let itTwo: Person;
  let a: { department: { id: string }; member: Person; assignmentId: string };
  let b: { department: { id: string }; member: Person; assignmentId: string };
  let reportA: Row;
  let reportB: Row;
  let restoreToday: (() => void) | undefined;

  const read = async (account = h.it1, query = '') =>
    h.dataOf<Page>(await h.listIssues(account, `?pageSize=100${query}`).expect(200));
  const idsOf = async (account = h.it1, query = '') => (await read(account, query)).items.map((row) => row.id);

  beforeAll(async () => {
    await h.start();
    restoreToday = h.pretendToday(MONDAY);
    const subscriptionId = await h.subscription(80, 'K2');
    it1 = { employeeId: h.it1.employeeId, account: h.it1 };
    const seat = await h.departmentWithUnit('P-SDI');
    itTwo = await h.staff(seat, 'SD-IT2', 'IT_ADMIN');
    a = await h.reporterIn('P-SDA', it1, { subscriptionId });
    b = await h.reporterIn('P-SDB', itTwo, { subscriptionId });
    reportA = (await h.reported(a.member.account, a.assignmentId, {
      description: '  Figma does not open on my laptop \nIt shows a blank page since Monday.',
    })) as unknown as Row;
    reportB = (await h.reported(b.member.account, b.assignmentId, {
      description: 'Cannot sign in',
    })) as unknown as Row;
  }, 300000);

  afterAll(async () => {
    restoreToday?.();
    await h.stop();
  });

  describe('the rows', () => {
    it('say the department of the reporter and a title: the first line of what they wrote', async () => {
      const rows = (await read(h.it1, '&scope=all')).items;

      expect(rows.find((row) => row.id === reportA.id)).toMatchObject({
        title: 'Figma does not open on my laptop',
        department: { id: a.department.id },
      });
      expect(rows.find((row) => row.id === reportB.id)).toMatchObject({
        title: 'Cannot sign in',
        department: { id: b.department.id },
      });
      expect(rows.find((row) => row.id === reportA.id)?.department?.name).toEqual(expect.any(String));
    });

    it('carry the logo of the application of the plan, null when none is set', async () => {
      const before = (await read(h.it1, '&scope=all')).items.find((row) => row.id === reportA.id);
      expect(before?.plan.logoUrl).toBeNull();

      await h.ctx.sql.query(
        `UPDATE applications SET logo_url = 'https://cdn.example.com/issue.png'
          WHERE id = (SELECT p.application_id FROM license_assignments a JOIN plans p ON p.id = a.plan_id WHERE a.id = $1)`,
        [a.assignmentId],
      );

      const after = (await read(h.it1, '&scope=all')).items.find((row) => row.id === reportA.id);
      expect(after?.plan.logoUrl).toBe('https://cdn.example.com/issue.png');
    });
  });

  describe('departmentId', () => {
    it('keeps the reports of the people placed in the department of the IT Admin', async () => {
      expect(await idsOf(h.it1, '&scope=all&departmentId=' + a.department.id)).toEqual([reportA.id]);
      expect(await idsOf(itTwo.account, '&scope=all&departmentId=' + b.department.id)).toEqual([reportB.id]);
    });

    it('goes with the other filters of the list', async () => {
      expect(await idsOf(h.it1, `&scope=all&state=NEW&departmentId=${a.department.id}`)).toEqual([reportA.id]);
      expect(await idsOf(h.it1, `&scope=all&state=RESOLVED&departmentId=${a.department.id}`)).toEqual([]);
    });

    it('answers an empty page, not an error, for a department the IT Admin does not work, though the whole list is theirs to read', async () => {
      const everything = await idsOf(h.it1, '&scope=all');
      const outside = await read(h.it1, '&scope=all&departmentId=' + b.department.id);

      expect(everything).toEqual(expect.arrayContaining([reportA.id, reportB.id]));
      expect(outside.items).toEqual([]);
      expect(outside.pagination.totalItems).toBe(0);
    });

    it('answers an empty page for a department that does not exist', async () => {
      expect(await idsOf(h.it1, '&scope=all&departmentId=3f0c7d54-9e1b-4f6a-8d2c-5b7a1e9c0d11')).toEqual([]);
    });

    it('is refused to someone who is not an IT Admin, who reads only their own reports', async () => {
      const refused = await h.listIssues(a.member.account, `?departmentId=${a.department.id}`).expect(403);

      expect(h.codeOf(refused)).toBe('SAAS_ISSUE.SCOPE_FORBIDDEN');
    });

    it('is refused when it is not an id', async () => {
      expect(h.codeOf(await h.listIssues(h.it1, '?departmentId=design').expect(422))).toBe('VALIDATION_ERROR');
    });
  });

  describe('the IT Admin who is not in charge', () => {
    it('reads the report of another department with scope=all and moves it, as before (the report is still handled by whoever is free)', async () => {
      expect(await idsOf(h.it1)).toEqual([reportA.id]);
      expect(await idsOf(h.it1, '&scope=all')).toContain(reportB.id);

      const moved = await h.moveIssue(reportB.id, { to: 'IN_PROGRESS' }, h.it1).expect(200);

      expect(h.dataOf<Row>(moved)).toMatchObject({ id: reportB.id, state: 'IN_PROGRESS' });
    });
  });
});
