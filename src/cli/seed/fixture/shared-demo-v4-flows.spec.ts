import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { dayOffset, endOfMonth } from '../demo-dates';
import { subscriptionHasPlan } from '../steps/catalog.steps';
import { INSTALLATION } from './shared-demo-v4/installation';
import { SHARED_DEMO_V4 as F } from './shared-demo-v4';

const person = (code: string) => F.people.find((candidate) => candidate.code === code)!;
const plan = (key: string) => F.applications.flatMap((app) => app.plans).find((candidate) => candidate.key === key)!;
const subscriptionOf = (planKey: string) =>
  F.subscriptions.find((candidate) => subscriptionHasPlan(candidate, planKey))!;
const department = (code: string) => F.departments.find((candidate) => candidate.code === code)!;

describe('shared dataset v4: the budgets', () => {
  it('has an approved budget of the year for every department with a Cost Center and a head, and only for them', () => {
    expect(F.budgets.map((b) => b.department).sort()).toEqual(
      F.departments
        .filter((d) => d.costCenter !== null && d.head !== null)
        .map((d) => d.code)
        .sort(),
    );
    expect(department('LGL').head).toBeNull();
  });

  it('makes the three outcomes of the budget check come out whatever the day', () => {
    const cost = (key: string) => {
      const request = F.requests.find((r) => r.key === key)!;
      expect(request.termMonths).toBe(1);

      return BigInt(subscriptionOf(request.plan!).unitPrice!.amount);
    };
    const base = (code: string) => BigInt(F.budgets.find((b) => b.department === code)!.base);
    const reserve = (code: string) => base(code) / 10n;
    expect(cost('R10')).toBeGreaterThan(base('MKT'));
    expect(cost('R10')).toBeLessThanOrEqual(base('MKT') + reserve('MKT'));
    expect(cost('R21')).toBeGreaterThan(base('DES'));
    expect(cost('R21')).toBeLessThanOrEqual(base('DES') + reserve('DES'));
    expect(cost('R11')).toBeGreaterThan(base('SAL') + reserve('SAL'));
    for (const code of ['MKT', 'DES', 'SAL']) {
      const others = F.requests.filter(
        (r) =>
          person(r.requester).department === code &&
          !['R10', 'R21', 'R11'].includes(r.key) &&
          ['COMPLETED', 'AWAITING_EXECUTION', 'AWAITING_SPEND_DECISION'].includes(r.target) &&
          plan(r.plan ?? '')?.provisioningType !== 'K5',
      );
      expect(others).toEqual([]);
    }
  });

  it('keeps versions within the annual ceiling less pool reserve and leaves next year at every stage (DEMO-15)', () => {
    const withReserve = (base: string) => (BigInt(base) * 11n) / 10n;
    const sum = (bases: string[]) => bases.reduce((total, base) => total + withReserve(base), 0n);
    const room = (cycle: typeof F.cycle) => BigInt(cycle.annualCeiling) - BigInt(cycle.sharedPoolReserve);
    expect(sum(F.budgets.map((b) => b.base))).toBeLessThanOrEqual(room(F.cycle));
    const versions = F.nextYear.filter((n) => n.stage !== 'PROPOSAL_SUBMITTED');
    expect(sum(versions.map((n) => n.base))).toBeLessThanOrEqual(room(F.nextCycle));
    expect(new Set(F.nextYear.map((n) => n.stage))).toEqual(
      new Set(['PROPOSAL_SUBMITTED', 'VERSION_SENT', 'VERSION_RETURNED', 'APPROVED']),
    );
    expect(F.nextYear.filter((n) => n.afterNext).map((n) => n.stage)).toEqual(['PROPOSAL_SUBMITTED']);
    expect([F.cycle.open, F.nextCycle.open, F.afterNextCycle.open]).toEqual([true, true, true]);
  });
});

describe('shared dataset v4: the requests of MF-1 and W3-28', () => {
  const OPEN = [
    'PENDING',
    'AWAITING_SPEND_SUBMISSION',
    'AWAITING_SPEND_DECISION',
    'AWAITING_EXECUTION',
    'AWAITING_IT_ASSESSMENT',
    'RESERVE_UNCONFIRMED',
    'AWAITING_REQUESTER_REVISION',
    'EXECUTING',
    'PENDING_OR_CANCELLED',
  ];

  it('keeps every person within three open requests at any time (GH-2), in the order they are sent', () => {
    expect(new Set(F.requests.map((r) => r.key)).size).toBe(F.requests.length);
    const open = new Map<string, number>();
    for (const r of F.requests) {
      expect(person(r.requester).account).not.toBeNull();
      expect(r.requester).not.toBe(F.approvalRoles.SPENDING_APPROVER);
      const count = open.get(r.requester) ?? 0;
      expect(count).toBeLessThan(3);
      if (OPEN.includes(r.target)) open.set(r.requester, count + 1);
    }
  });

  it('covers every state of the flow, W3-28 purchase/lot/K1-annual cases, and term rules (QĐ-111i)', () => {
    const targets = new Set(F.requests.map((r) => r.target));
    for (const t of [
      'PENDING',
      'REJECTED',
      'WITHDRAWN',
      'WITHDRAWN_AFTER_RETURN',
      'AWAITING_SPEND_SUBMISSION',
      'AWAITING_SPEND_DECISION',
      'AWAITING_EXECUTION',
      'AWAITING_IT_ASSESSMENT',
      'RESERVE_UNCONFIRMED',
      'BLOCKED',
      'COMPLETED',
    ])
      expect(targets).toContain(t);
    expect(F.requests.find((r) => r.key === 'R61')).toMatchObject({
      plan: 'canva-teams',
      beneficiaries: ['NV-ITO1', 'NV-ITO2'],
      target: 'EXECUTING',
    });
    expect(F.requests.find((r) => r.key === 'R62')).toMatchObject({
      plan: 'jetbrains-datagrip',
      target: 'COMPLETED',
      grant: 'PURCHASE',
    });
    expect(F.requests.find((r) => r.key === 'R65')).toMatchObject({
      plan: 'claude-pro',
      termMonths: 12,
      target: 'COMPLETED',
      grant: 'PURCHASE',
    });
    const withTerm = new Set(F.people.filter((p) => p.employmentType !== 'STAFF').map((p) => p.code));
    for (const request of [...F.requests, { ...F.draft, key: 'draft' }]) {
      const declared = request.plan ? plan(request.plan) : null;
      if (declared?.provisioningType === 'K1') {
        if (declared.referenceCommitmentMonths === 12) expect(request.termMonths).toBe(12);
        else {
          expect(request.termMonths).toBeGreaterThanOrEqual(1);
          expect(request.termMonths).toBeLessThanOrEqual(9);
        }
      }
      if (declared?.provisioningType === 'K4') expect(request.termMonths).toBeNull();
      if (withTerm.has(request.requester) && declared?.provisioningType !== 'K4') {
        expect(request.termMonths).not.toBeNull();
      }
    }
    expect(department(person(F.draft.requester).department!).costCenter).toBeNull();
    expect(dayOffset('2026-11-10', 20)).toBe('2026-11-30');
    expect(endOfMonth('2026-02-10')).toBe('2026-02-28');
  });
});

describe('shared dataset v4: the eighteen requests of S10b (T12)', () => {
  const NEW_PEOPLE = new Set([
    'NV-DEV5',
    'NV-DEV6',
    'NV-DEV7',
    'NV-ITO1',
    'NV-ITO2',
    'NV-FIN2',
    'NV-BOD1',
    'NV-BOD2',
    'NV-BOD3',
    'NV-BOD4',
    'NV-BOD5',
    'NV-BOD6',
    'NV-SAL3',
    'NV-SAL4',
    'NV-OPS2',
    'NV-NEW2',
    'NV-NEW3',
  ]);
  const OLD_SENDERS = new Set(['NV-FINH', 'NV-DEP', 'NV-ITOH']);
  const extra = F.requests.filter((r) => /^R(4\d|5[0-8])$/.test(r.key));
  const request = (key: string) => F.requests.find((r) => r.key === key)!;

  it('adds R40 to R57 and R58 at the end while keeping MKT/DES/SAL untouched', () => {
    expect(extra.map((r) => r.key).sort()).toEqual(Array.from({ length: 19 }, (_, i) => `R${40 + i}`));
    expect(F.requests.slice(-19)).toEqual(extra);
    for (const r of extra) {
      expect(NEW_PEOPLE.has(r.requester) || OLD_SENDERS.has(r.requester)).toBe(true);
      for (const code of [r.requester, ...(r.beneficiaries ?? [])]) {
        expect(['MKT', 'DES', 'SAL']).not.toContain(person(code).department);
      }
    }
    expect(F.requests.indexOf(request('R58'))).toBeLessThan(F.requests.indexOf(request('R49')));
    expect(request('R41')).toMatchObject({ plan: 'claude-pro', termMonths: 12, target: 'REJECTED', rejectAt: 'SPEND' });
  });

  it('covers withdrawals, returns, failures, reserve confirmations, and K1/K5 requests (QĐ-113d, SBF-17)', () => {
    expect(
      F.requests
        .filter((r) => r.target === 'WITHDRAWN' || r.target === 'WITHDRAWN_AFTER_RETURN')
        .map((r) => `${r.key}:${r.target}`),
    ).toEqual(['R05:WITHDRAWN', 'R60:WITHDRAWN_AFTER_RETURN']);
    expect(request('R48')).toMatchObject({ target: 'FAILED', grant: 'POOL' });
    expect(request('R42').confirmReserve).toBe(true);
    expect(request('R55').confirmReserve).toBe(true);
    expect(request('R57')).toMatchObject({ target: 'PENDING_OR_CANCELLED', readAs: 'NV-ENGH' });
    expect(request('R50').termMonths).toBeNull();
    expect(request('R56')).toMatchObject({ termMonths: 2, grant: 'PURCHASE' });
  });
});

describe('shared dataset v4: MF-2, MF-3, MF-5 usage & documentation', () => {
  const emailOf = (code: string) => `${person(code).email}@${F.emailDomain}`;
  const source = (key: string) => F.usageSources.find((s) => s.key === key)!;
  const inactiveDays = (code: string) =>
    source('figma').rows.find((r) => r.identifier === emailOf(code))!.lastActivityDaysAgo! -
    source('figma').windowToDaysAgo;

  it('reaches usage tiers 30/60/90 and keeps traps intact for MF-5', () => {
    expect(inactiveDays('NV-DES1')).toBe(79);
    expect(inactiveDays('NV-DES4')).toBeGreaterThanOrEqual(30);
    expect(inactiveDays('NV-DES10')).toBeGreaterThanOrEqual(90);
    expect(source('figma').windowToDaysAgo).toBeLessThanOrEqual(7);
    expect(source('jira').windowToDaysAgo).toBeLessThanOrEqual(7);
    expect(source('canva').windowToDaysAgo).toBeGreaterThan(7);
    expect(new Set(F.ghostDecisions.map((d) => d.choice))).toEqual(new Set(['KEEP', 'RECLAIM', 'EXEMPT']));
    expect(F.personnel.map((e) => e.kind).sort()).toEqual(['LONG_LEAVE', 'OFFBOARDING', 'OFFBOARDING', 'TRANSFER']);
  });

  it('blocks NV-OFF1 today with a K1 seat granted via Request R64 (no K1 baseline or subscription)', () => {
    const off1 = F.personnel.find((e) => e.kind === 'OFFBOARDING' && e.employee === 'NV-OFF1')!;
    expect(off1).not.toHaveProperty('lastDayInWorkingDays');
    expect(F.requests.find((r) => r.key === 'R64')).toMatchObject({
      requester: 'NV-OFF1',
      plan: 'grammarly-pro',
      target: 'COMPLETED',
    });
    expect(F.seats.some((s) => s.subscription === 'grammarly')).toBe(false);
    expect(F.subscriptions.filter((s) => s.responsible === 'NV-ITA4').map((s) => s.plan)).toEqual([
      'mailchimp-standard',
    ]);
    expect(F.personnel.find((e) => e.kind === 'TRANSFER')).toMatchObject({
      employee: 'NV-DEV4',
      toDepartment: 'ITO',
      effectiveInDays: 1,
    });
  });

  it('documents every account with its final role and head scope in README.md', () => {
    const readme = readFileSync(join(__dirname, 'shared-demo-v4/README.md'), 'utf8').replace(/ {2,}/g, ' ');
    expect(readme).toContain(INSTALLATION.loginEmail);
    expect(readme).toContain('ADMIN');
    for (const p of F.people) {
      const role = p.code === F.approvalRoles.SPENDING_APPROVER ? 'SPENDING_APPROVER' : (p.account ?? '-');
      const email = p.account ? `${p.email}@${F.emailDomain}` : 'no account';
      const head = F.departments.find((d) => d.head === p.code)?.code ?? '-';
      expect(readme).toContain(`| ${p.code} | ${p.fullName} | ${email} | ${role} | ${p.department ?? '-'} | ${head} |`);
    }
  });
});
