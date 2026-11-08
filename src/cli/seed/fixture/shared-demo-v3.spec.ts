import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { INSTALLATION } from './shared-demo-v3/installation';
import { SHARED_DEMO_V3 } from './shared-demo-v3';
import { evenShareOf } from '../steps/finance.steps';

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
  it('divides the annual ceiling so that the departments and the reserve never add up to more, whatever their number', () => {
    const { annualCeiling, sharedPoolReserve } = SHARED_DEMO_V3.cycle;

    for (const departments of [1, 7, 19, 200, 5000]) {
      const share = BigInt(evenShareOf(annualCeiling, sharedPoolReserve, departments));

      expect(share * BigInt(departments) + BigInt(sharedPoolReserve)).toBeLessThanOrEqual(BigInt(annualCeiling));
    }
    expect(evenShareOf(annualCeiling, sharedPoolReserve, 0)).toBe('0');
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

  describe('the next-year proposal and the invoices of the finance screens', () => {
    const readme = () => readFileSync(join(__dirname, 'shared-demo-v3/README.md'), 'utf8').replace(/ {2,}/g, ' ');

    it('leaves the proposal for a later year to a department that has a head, a Cost Center and no budget of its own', () => {
      expect(SHARED_DEMO_V3.proposals.length).toBeGreaterThan(0);
      for (const proposal of SHARED_DEMO_V3.proposals) {
        const department = SHARED_DEMO_V3.departments.find((candidate) => candidate.code === proposal.department);
        expect(department?.head).not.toBeNull();
        expect(department?.costCenter).not.toBeNull();
        expect(SHARED_DEMO_V3.budgets.map((budget) => budget.department)).not.toContain(proposal.department);
        expect(proposal.yearOffset).toBeGreaterThanOrEqual(1);
        const plans = SHARED_DEMO_V3.applications.flatMap((application) => application.plans.map((plan) => plan.key));
        for (const line of proposal.lines) expect(plans).toContain(line.plan);
      }
    });

    it('records each invoice against the commitment of a request that reaches COMPLETED, one invoice for each request', () => {
      const requests = SHARED_DEMO_V3.invoices.map((invoice) => invoice.request);
      expect(new Set(requests).size).toBe(requests.length);
      expect(new Set(SHARED_DEMO_V3.invoices.map((invoice) => invoice.key)).size).toBe(requests.length);
      for (const invoice of SHARED_DEMO_V3.invoices) {
        const scenario = SHARED_DEMO_V3.requests.find((candidate) => candidate.key === invoice.request);
        expect(scenario?.target).toBe('COMPLETED');
        expect(scenario?.plan).toBeDefined();
        expect(invoice.issuedDaysAgo).toBeGreaterThanOrEqual(0);
        expect(invoice.note.length).toBeLessThanOrEqual(1000);
        // The number is the tag and the key: at most 64 characters, as the API accepts.
        expect(`${SHARED_DEMO_V3.marker}-${invoice.key}`.length).toBeLessThanOrEqual(64);
      }
    });

    it('covers the three matches: part of the price, only the tax differs, and more than the commitment allowed', () => {
      const [fits, taxOnly, over] = ['HD1', 'HD2', 'HD3'].map((key) =>
        SHARED_DEMO_V3.invoices.find((i) => i.key === key),
      );
      expect(fits).toMatchObject({ deductibleTaxPercent: 0, nonDeductibleTaxPercent: 0 });
      expect(fits?.netPercent).toBeGreaterThan(0);
      expect(fits?.netPercent).toBeLessThan(100);
      expect(taxOnly?.netPercent).toBeLessThanOrEqual(100);
      expect(taxOnly?.deductibleTaxPercent).toBeGreaterThan(0);
      expect(taxOnly?.nonDeductibleTaxPercent).toBeGreaterThan(0);
      expect(over?.netPercent).toBeGreaterThan(100);
      // Three different commitments, in three different departments.
      const departments = SHARED_DEMO_V3.invoices.map((invoice) => {
        const requester = SHARED_DEMO_V3.requests.find((r) => r.key === invoice.request)?.requester;
        return SHARED_DEMO_V3.people.find((person) => person.code === requester)?.department;
      });
      expect(new Set(departments).size).toBe(3);
    });

    it('seats the requests of the invoices on a subscription their own department owns, with a seat to give', () => {
      for (const invoice of SHARED_DEMO_V3.invoices) {
        const scenario = SHARED_DEMO_V3.requests.find((candidate) => candidate.key === invoice.request);
        const requester = SHARED_DEMO_V3.people.find((person) => person.code === scenario?.requester);
        const subscription = SHARED_DEMO_V3.subscriptions.find((candidate) => candidate.key === scenario?.grantFrom);
        expect(subscription?.plan).toBe(scenario?.plan);
        expect(subscription?.ownerDepartment).toBe(requester?.department);
        expect(subscription?.quantity).toBeGreaterThan(0);
        // The department has a budget line for the plan of the request, which the batch attaches it to.
        const budget = SHARED_DEMO_V3.budgets.find((candidate) => candidate.department === requester?.department);
        expect(budget?.lines.map((line) => line.plan)).toContain(scenario?.plan);
      }
    });

    it('documents the proposal, the invoices and the requests that carry them', () => {
      const text = readme();
      for (const proposal of SHARED_DEMO_V3.proposals)
        expect(text).toContain(`| Next-year proposal ${proposal.department}`);
      for (const invoice of SHARED_DEMO_V3.invoices)
        expect(text).toContain(`| Invoice ${invoice.key} | ${invoice.request} |`);
      for (const request of SHARED_DEMO_V3.requests)
        expect(text).toContain(`| ${request.key} | ${request.requester} |`);
    });
  });
});
