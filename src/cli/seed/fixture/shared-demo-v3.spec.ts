import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { INSTALLATION } from './shared-demo-v3/installation';
import { SHARED_DEMO_V3 } from './shared-demo-v3';

describe('shared dataset v3 single-role accounts', () => {
  it('has 23 employees and 21 accounts, each with one initial role', () => {
    expect(SHARED_DEMO_V3.people).toHaveLength(23);
    expect(SHARED_DEMO_V3.people.filter((person) => person.account !== null)).toHaveLength(21);
    expect(new Set(SHARED_DEMO_V3.people.map((person) => person.code)).size).toBe(23);
  });
  it('makes every head a Manager, with separate IT Admin and Finance people', () => {
    for (const department of SHARED_DEMO_V3.departments) {
      if (department.head === null) continue;
      const head = SHARED_DEMO_V3.people.find((person) => person.code === department.head);
      expect(head).toMatchObject({ account: 'MANAGER', department: department.code });
      expect(department.itAdmin).not.toBe(department.head);
    }
    expect(SHARED_DEMO_V3.departments.find((department) => department.code === 'ITO')?.head).toBe('NV-ITOH');
    expect(SHARED_DEMO_V3.people.find((person) => person.code === 'NV-ITA1')?.account).toBe('IT_ADMIN');
    expect(SHARED_DEMO_V3.people.find((person) => person.code === 'NV-FIN1')?.account).toBe('FINANCE');
  });
  it('prepares the spending approver as EMPLOYEE before the role change step', () => {
    expect(
      SHARED_DEMO_V3.people.find((person) => person.code === SHARED_DEMO_V3.approvalRoles.SPENDING_APPROVER)?.account,
    ).toBe('EMPLOYEE');
  });
  it('documents every account with its final role and head scope, and a separate bootstrap identity', () => {
    const readme = readFileSync(join(__dirname, 'shared-demo-v3/README.md'), 'utf8').replace(/ {2,}/g, ' ');
    expect(readme).toContain(INSTALLATION.loginEmail);
    expect(readme).toContain('ADMIN');
    for (const person of SHARED_DEMO_V3.people) {
      const role =
        person.code === SHARED_DEMO_V3.approvalRoles.SPENDING_APPROVER ? 'SPENDING_APPROVER' : (person.account ?? '-');
      const email = person.account ? `${person.email}@${SHARED_DEMO_V3.emailDomain}` : 'no account';
      const head = SHARED_DEMO_V3.departments.find((department) => department.head === person.code)?.code ?? '-';
      expect(readme).toContain(
        `| ${person.code} | ${person.fullName} | ${email} | ${role} | ${person.department} | ${head} |`,
      );
      expect(person.code).toMatch(/^[A-Z0-9]+(-[A-Z0-9]+)*$/);
      expect(person.code.length).toBeLessThanOrEqual(20);
    }
  });
  it('keeps spending approver outside requests and subscription ownership in one valid department', () => {
    for (const request of SHARED_DEMO_V3.requests)
      expect(request.requester).not.toBe(SHARED_DEMO_V3.approvalRoles.SPENDING_APPROVER);
    for (const subscription of SHARED_DEMO_V3.subscriptions)
      expect(SHARED_DEMO_V3.departments.some((department) => department.code === subscription.ownerDepartment)).toBe(
        true,
      );
  });
  it('sends nothing the API dropped in Wave 1: no plan line, terms of at most 12 months, a reserve that is the default share', () => {
    for (const request of SHARED_DEMO_V3.requests) {
      expect(request).not.toHaveProperty('planLine');
      expect(request.termMonths).toBeGreaterThanOrEqual(1);
      expect(request.termMonths).toBeLessThanOrEqual(12);
    }
    for (const budget of SHARED_DEMO_V3.budgets) expect(budget).not.toHaveProperty('reserve');
  });
  it('names nobody a user sees with the word demo or test, and no tenant of the real world', () => {
    // The whole fixture (departments, people, catalog, finance, requests, extras, revocation notes...) and the installation: only the id of the
    // fixture, an identifier and not shown, may carry the word.
    const shown = JSON.stringify([SHARED_DEMO_V3, INSTALLATION], (key, value: unknown) =>
      key === 'id' ? undefined : value,
    );
    expect(shown).not.toMatch(/demo|DS1|kiểm thử/i);
    // The titles of the steps are what the operator reads in the report of the run.
    const titles = readdirSync(join(__dirname, '../steps'))
      .filter((file) => file.endsWith('.steps.ts'))
      .flatMap((file) => [...readFileSync(join(__dirname, '../steps', file), 'utf8').matchAll(/title: '([^']*)'/g)])
      .map((match) => match[1]);
    expect(titles.length).toBeGreaterThan(10);
    expect(titles.join(' | ')).not.toMatch(/demo|DS1|kiểm thử/i);
    expect(SHARED_DEMO_V3.emailDomain).toBe('saoviet.example');
    expect(INSTALLATION.organizationName).toBe('Công ty Cổ phần Công nghệ Sao Việt');
  });
});
