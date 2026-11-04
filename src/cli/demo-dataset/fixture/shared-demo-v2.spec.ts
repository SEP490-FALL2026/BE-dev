import { SHARED_DEMO_V2 } from './shared-demo-v2';

describe('shared demo v2 single-role accounts', () => {
  it('has 23 employees and 21 accounts, each with one initial role', () => {
    expect(SHARED_DEMO_V2.people).toHaveLength(23);
    expect(SHARED_DEMO_V2.people.filter((person) => person.account !== null)).toHaveLength(21);
    expect(new Set(SHARED_DEMO_V2.people.map((person) => person.code)).size).toBe(23);
  });
  it('makes every head a Manager, with separate IT Admin and Finance people', () => {
    for (const department of SHARED_DEMO_V2.departments) {
      if (department.head === null) continue;
      const head = SHARED_DEMO_V2.people.find((person) => person.code === department.head);
      expect(head).toMatchObject({ account: 'MANAGER', department: department.code });
      expect(department.itAdmin).not.toBe(department.head);
    }
    expect(SHARED_DEMO_V2.departments.find((department) => department.code === 'DS1-ITO')?.head).toBe('DS1-ITOH');
    expect(SHARED_DEMO_V2.people.find((person) => person.code === 'DS1-ITA1')?.account).toBe('IT_ADMIN');
    expect(SHARED_DEMO_V2.people.find((person) => person.code === 'DS1-FIN1')?.account).toBe('FINANCE');
  });
  it('prepares the spending approver as EMPLOYEE before the role change step', () => {
    expect(
      SHARED_DEMO_V2.people.find((person) => person.code === SHARED_DEMO_V2.approvalRoles.SPENDING_APPROVER)?.account,
    ).toBe('EMPLOYEE');
  });
});
