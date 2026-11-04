import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { INSTALLATION } from './shared-demo-v2/installation';
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
  it('documents every account with its final role and head scope, and a separate bootstrap identity', () => {
    const readme = readFileSync(join(__dirname, 'shared-demo-v2/README.md'), 'utf8').replace(/ {2,}/g, ' ');
    expect(readme).toContain(INSTALLATION.loginEmail);
    expect(readme).toContain('DS1-ADMIN');
    for (const person of SHARED_DEMO_V2.people) {
      const role =
        person.code === SHARED_DEMO_V2.approvalRoles.SPENDING_APPROVER ? 'SPENDING_APPROVER' : (person.account ?? '-');
      const email = person.account ? `${person.email}@${SHARED_DEMO_V2.emailDomain}` : 'no account';
      const head = SHARED_DEMO_V2.departments.find((department) => department.head === person.code)?.code ?? '-';
      expect(readme).toContain(
        `| ${person.code} | ${person.fullName} | ${email} | ${role} | ${person.department} | ${head} |`,
      );
      expect(person.code).toMatch(/^[A-Z0-9]+(-[A-Z0-9]+)*$/);
      expect(person.code.length).toBeLessThanOrEqual(20);
    }
  });
  it('keeps spending approver outside requests and subscription ownership in one valid department', () => {
    for (const request of SHARED_DEMO_V2.requests)
      expect(request.requester).not.toBe(SHARED_DEMO_V2.approvalRoles.SPENDING_APPROVER);
    for (const subscription of SHARED_DEMO_V2.subscriptions)
      expect(SHARED_DEMO_V2.departments.some((department) => department.code === subscription.ownerDepartment)).toBe(
        true,
      );
    expect(
      SHARED_DEMO_V2.requests.filter((request) => request.planLine).map((request) => [request.key, request.planLine]),
    ).toEqual([
      ['R1', 1],
      ['R2', 2],
    ]);
    expect(SHARED_DEMO_V2.requests.find((request) => request.key === 'R7')?.planLine).toBeUndefined();
  });
});
