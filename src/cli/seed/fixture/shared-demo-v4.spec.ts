import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { dayOffset, endOfMonth } from '../demo-dates';
import { evenShareOf } from '../steps/finance.steps';
import { INSTALLATION } from './shared-demo-v4/installation';
import { SHARED_DEMO_V4 as F } from './shared-demo-v4';

const person = (code: string) => F.people.find((candidate) => candidate.code === code)!;
const plan = (key: string) => F.applications.flatMap((app) => app.plans).find((candidate) => candidate.key === key)!;
const subscriptionOf = (planKey: string) => F.subscriptions.find((candidate) => candidate.plan === planKey)!;
const department = (code: string) => F.departments.find((candidate) => candidate.code === code)!;

describe('shared dataset v4: the organization', () => {
  it('has unique codes and emails that fit the rules of the API', () => {
    expect(new Set(F.people.map((p) => p.code)).size).toBe(F.people.length);
    expect(new Set(F.people.map((p) => p.email)).size).toBe(F.people.length);
    for (const p of F.people) {
      expect(p.code).toMatch(/^[A-Z0-9]+(-[A-Z0-9]+)*$/);
      expect(p.code.length).toBeLessThanOrEqual(20);
    }
  });

  it('makes every head a Manager, gives every department an IT Admin, and leaves only Legal without a head', () => {
    for (const d of F.departments) {
      if (d.head !== null) expect(person(d.head)).toMatchObject({ account: 'MANAGER', department: d.code });
      expect(d.itAdmin).not.toBe(d.head);
      expect(person(d.itAdmin!).account).toBe('IT_ADMIN');
    }
    expect(F.departments.filter((d) => d.head === null).map((d) => d.code)).toEqual(['LGL']);
  });

  it('puts at most four departments in the charge of one IT Admin (QĐ-110l): the API refuses a fifth', () => {
    const inCharge = new Map<string, number>();
    for (const d of F.departments) inCharge.set(d.itAdmin!, (inCharge.get(d.itAdmin!) ?? 0) + 1);

    expect(Math.max(...inCharge.values())).toBeLessThanOrEqual(4);
    expect(F.people.filter((p) => p.account === 'IT_ADMIN').map((p) => p.code)).toEqual([
      'NV-ITA1',
      'NV-ITA2',
      'NV-ITA3',
    ]);
  });

  it('has exactly one Finance, one spending approver prepared as EMPLOYEE for the role step, and a Cost Center for all but Operations', () => {
    expect(F.people.filter((p) => p.account === 'FINANCE')).toHaveLength(1);
    expect(person(F.approvalRoles.SPENDING_APPROVER).account).toBe('EMPLOYEE');
    expect(F.departments.filter((d) => d.costCenter === null).map((d) => d.code)).toEqual(['OPS']);
  });

  it('has enough people in one department for a group', () => {
    expect(F.people.filter((p) => p.department === 'ENG').length).toBeGreaterThanOrEqual(5);
  });
});

describe('shared dataset v4: the catalog and the shared pool', () => {
  it('has one subscription per plan of the catalog except the internal one', () => {
    const plans = F.applications.flatMap((app) => app.plans).filter((p) => p.provisioningType !== 'K5');
    expect(F.subscriptions.map((s) => s.plan).sort()).toEqual(plans.map((p) => p.key).sort());
  });

  it('covers K1, K2 with free seats and a sold-out plan, K4 with and without keys, and K5', () => {
    const types = new Set(F.applications.flatMap((app) => app.plans.map((p) => p.provisioningType)));
    expect([...types].sort()).toEqual(['K1', 'K2', 'K4', 'K5']);
    expect(subscriptionOf('postman-professional').freeAfterBaseline).toBeGreaterThan(0);
    expect(subscriptionOf('onepassword-business').freeAfterBaseline).toBe(0);
    expect(F.keys.find((k) => k.subscription === 'jetbrains')?.count).toBeGreaterThan(0);
    expect(F.keys.some((k) => k.subscription === 'datagrip')).toBe(false);
  });

  it('has one annual subscription with a commitment, and one priced in a foreign currency with a rate for it', () => {
    const annual = F.subscriptions.filter((s) => s.billingCycle === 'ANNUAL');
    expect(annual).toHaveLength(1);
    expect(annual[0]).toMatchObject({ termMonths: 12, renewalInDays: 50 });
    const foreign = F.subscriptions.filter((s) => s.unitPrice.currency !== F.currency);
    expect(foreign).toHaveLength(1);
    expect(F.exchangeRates.map((r) => r.currency)).toContain(foreign[0].unitPrice.currency);
  });

  it('holds only seats of declared people and subscriptions, one seat of a person per subscription', () => {
    const held = new Set<string>();
    for (const seat of F.seats) {
      expect(F.subscriptions.map((s) => s.key)).toContain(seat.subscription);
      expect(person(seat.holder)).toBeDefined();
      expect(held.has(`${seat.subscription}:${seat.holder}`)).toBe(false);
      held.add(`${seat.subscription}:${seat.holder}`);
    }
  });

  it('never makes a person ask for a plan they already hold', () => {
    for (const request of F.requests) {
      const subscription = request.plan ? subscriptionOf(request.plan) : undefined;
      if (!subscription) continue;
      for (const code of request.beneficiaries ?? [request.requester]) {
        expect(F.seats.some((s) => s.subscription === subscription.key && s.holder === code)).toBe(false);
      }
    }
  });

  it('leaves the pool enough free seats for what is granted from it', () => {
    const drawn = new Map<string, number>();
    for (const request of F.requests) {
      const subscription = request.plan ? subscriptionOf(request.plan) : undefined;
      if (!subscription || subscription.quantity !== undefined) continue;
      if (request.grant === 'PURCHASE' || !['COMPLETED', 'AWAITING_EXECUTION'].includes(request.target)) continue;
      drawn.set(subscription.key, (drawn.get(subscription.key) ?? 0) + (request.beneficiaries?.length ?? 1));
    }
    for (const [key, used] of drawn) {
      expect(F.subscriptions.find((s) => s.key === key)!.freeAfterBaseline).toBeGreaterThanOrEqual(used);
    }
  });
});

describe('shared dataset v4: the budgets', () => {
  it('has an approved budget of the year for every department with a Cost Center, and only for them', () => {
    expect(F.budgets.map((b) => b.department).sort()).toEqual(
      F.departments
        .filter((d) => d.costCenter !== null)
        .map((d) => d.code)
        .sort(),
    );
    expect(F.budgets.find((b) => b.department === 'LGL')?.origin).toBe('BASELINE');
    expect(department('LGL').head).toBeNull();
  });

  it('makes the three outcomes of the budget check come out whatever the day', () => {
    // A request that ends on the last day of the month costs one month of the price, whichever day it is sent on.
    const cost = (key: string) => {
      const request = F.requests.find((r) => r.key === key)!;
      expect(request.end).toBe('EOM');

      return BigInt(subscriptionOf(request.plan!).unitPrice.amount);
    };
    const base = (code: string) => BigInt(F.budgets.find((b) => b.department === code)!.base);
    const reserve = (code: string) => base(code) / 10n;
    expect(cost('R10')).toBeGreaterThan(base('MKT'));
    expect(cost('R10')).toBeLessThanOrEqual(base('MKT') + reserve('MKT'));
    expect(cost('R21')).toBeGreaterThan(base('DES'));
    expect(cost('R21')).toBeLessThanOrEqual(base('DES') + reserve('DES'));
    expect(cost('R11')).toBeGreaterThan(base('SAL') + reserve('SAL'));
    // Nothing else of these departments is held or waiting against their budget.
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

  it('opens the next year with a ceiling for each department, within the annual ceiling', () => {
    const { annualCeiling, sharedPoolReserve, ceilings } = F.nextCycle;
    const total = Object.values(ceilings ?? {}).reduce((sum, value) => sum + BigInt(value), BigInt(sharedPoolReserve));
    expect(total).toBeLessThanOrEqual(BigInt(annualCeiling));
    for (const next of F.nextYear) expect(Object.keys(ceilings ?? {})).toContain(next.department);
  });

  it('leaves the next year at every stage, with a proposal over its ceiling that has all four kinds of line', () => {
    expect(new Set(F.nextYear.map((n) => n.stage))).toEqual(
      new Set(['PROPOSAL_SUBMITTED', 'VERSION_SENT', 'CHANGES_REQUESTED']),
    );
    const eng = F.nextYear.find((n) => n.department === 'ENG')!;
    expect(new Set(eng.lines.map((l) => l.lineType))).toEqual(new Set(['RENEW', 'CHANGE', 'NEW', 'CANCEL']));
    const counted = eng.lines.filter((l) => l.lineType !== 'CANCEL').reduce((sum, l) => sum + BigInt(l.amount), 0n);
    expect(counted).toBeGreaterThan(BigInt(F.nextCycle.ceilings!.ENG));
    for (const line of eng.lines.filter((l) => l.lineType === 'NEW')) expect(line.zbb).toBeDefined();
    expect(F.nextYear.find((n) => n.stage === 'CHANGES_REQUESTED')?.reason).toBeTruthy();
  });

  it('divides the annual ceiling so that the departments and the reserve never add up to more, whatever their number', () => {
    const { annualCeiling, sharedPoolReserve } = F.cycle;
    for (const departments of [1, 7, 19, 200, 5000]) {
      const share = BigInt(evenShareOf(annualCeiling, sharedPoolReserve, departments));
      expect(share * BigInt(departments) + BigInt(sharedPoolReserve)).toBeLessThanOrEqual(BigInt(annualCeiling));
    }
    expect(evenShareOf(annualCeiling, sharedPoolReserve, 0)).toBe('0');
  });
});

describe('shared dataset v4: the requests of MF-1', () => {
  const OPEN = [
    'PENDING',
    'AWAITING_SPEND_SUBMISSION',
    'AWAITING_SPEND_DECISION',
    'AWAITING_EXECUTION',
    'AWAITING_IT_ASSESSMENT',
    'RESERVE_UNCONFIRMED',
  ];

  it('has unique keys and requesters with an account, none of them the spending approver', () => {
    expect(new Set(F.requests.map((r) => r.key)).size).toBe(F.requests.length);
    for (const r of F.requests) {
      expect(person(r.requester).account).not.toBeNull();
      expect(r.requester).not.toBe(F.approvalRoles.SPENDING_APPROVER);
      expect(r.plan !== undefined || r.proposal !== undefined).toBe(true);
      if (r.plan) expect(plan(r.plan)).toBeDefined();
    }
  });

  it('keeps every person within three open requests at any time (GH-2), in the order they are sent', () => {
    const open = new Map<string, number>();
    for (const r of F.requests) {
      const count = open.get(r.requester) ?? 0;
      expect(count).toBeLessThan(3);
      if (OPEN.includes(r.target)) open.set(r.requester, count + 1);
    }
  });

  it('covers every state of the flow and the routes of one step', () => {
    const targets = new Set(F.requests.map((r) => r.target));
    for (const t of [
      'PENDING',
      'REJECTED',
      'WITHDRAWN',
      'AWAITING_SPEND_SUBMISSION',
      'AWAITING_SPEND_DECISION',
      'AWAITING_EXECUTION',
      'AWAITING_IT_ASSESSMENT',
      'RESERVE_UNCONFIRMED',
      'BLOCKED',
      'COMPLETED',
    ])
      expect(targets).toContain(t);
    const heads = F.departments.map((d) => d.head);
    expect(F.requests.some((r) => heads.includes(r.requester) && r.target === 'AWAITING_SPEND_DECISION')).toBe(true);
    const headless = F.departments.find((d) => d.head === null)!.code;
    expect(F.requests.some((r) => person(r.requester).department === headless)).toBe(true);
    expect(F.requests.some((r) => r.beneficiaries && r.beneficiaries.length >= 2)).toBe(true);
    expect(F.requests.some((r) => r.proposal)).toBe(true);
    for (const type of ['K1', 'K4', 'K5']) {
      expect(F.requests.some((r) => r.plan && plan(r.plan).provisioningType === type)).toBe(true);
    }
  });

  it('gives a time-limited right to the contractor inside the 30-day window and another outside it', () => {
    const ends = F.requests.filter((r) => typeof r.end === 'object').map((r) => (r.end as { inDays: number }).inDays);
    expect(Math.min(...ends)).toBeLessThanOrEqual(30);
    expect(Math.max(...ends)).toBeGreaterThan(30);
    expect(person('NV-CTR1').employmentType).toBe('CONTRACTOR');
    expect(F.requests.find((r) => r.requester === 'NV-CTR1')?.end).toEqual({ inDays: 20 });
  });

  it('saves a draft in a department with no Cost Center, which can only stay a draft', () => {
    expect(department(person(F.draft.requester).department).costCenter).toBeNull();
  });

  it('counts its dates from today only', () => {
    expect(dayOffset('2026-11-10', 20)).toBe('2026-11-30');
    expect(endOfMonth('2026-02-10')).toBe('2026-02-28');
  });
});

describe('shared dataset v4: the usage and the people of MF-5', () => {
  const emailOf = (code: string) => `${person(code).email}@${F.emailDomain}`;
  const source = (key: string) => F.usageSources.find((s) => s.key === key)!;
  /** Days without activity, counted from the last day of the window of the file. */
  const inactiveDays = (code: string) => {
    const figma = source('figma');

    return figma.rows.find((r) => r.identifier === emailOf(code))!.lastActivityDaysAgo! - figma.windowToDaysAgo;
  };

  it('reaches the tiers 30/60/90 that the rules expect for the seats it raises', () => {
    expect(inactiveDays('NV-DES1')).toBe(79);
    expect(inactiveDays('NV-DES1')).toBeGreaterThanOrEqual(60);
    expect(inactiveDays('NV-DES1')).toBeLessThan(90);
    expect(inactiveDays('NV-DES4')).toBeGreaterThanOrEqual(30);
    expect(inactiveDays('NV-DES4')).toBeLessThan(60);
    expect(inactiveDays('NV-DES10')).toBeGreaterThanOrEqual(90);
    expect(source('figma').rows.some((r) => r.identifier.startsWith('manh.ngo+figma'))).toBe(true);
  });

  it('has a fresh Figma and Jira, a stale Canva, and a person with a Jira seat and no row (never used)', () => {
    expect(source('figma').windowToDaysAgo).toBeLessThanOrEqual(7);
    expect(source('jira').windowToDaysAgo).toBeLessThanOrEqual(7);
    expect(source('canva').windowToDaysAgo).toBeGreaterThan(7);
    expect(source('jira').rows.some((r) => r.identifier === emailOf('NV-DES3'))).toBe(false);
    expect(F.seats.some((s) => s.subscription === 'jira' && s.holder === 'NV-DES3')).toBe(true);
  });

  it('builds the traps the rules must leave alone', () => {
    const grantedAgo = (code: string) =>
      F.seats.find((s) => s.subscription === 'figma' && s.holder === code)!.grantedDaysAgo ?? 130;
    expect(grantedAgo('NV-DES6')).toBeLessThan(14);
    expect(grantedAgo('NV-DES9')).toBeLessThan(60);
    expect(F.seats.find((s) => s.subscription === 'figma' && s.holder === 'NV-DES10')?.endInDays).toBeLessThan(31);
    expect(source('figma').rows.some((r) => r.identifier === 'vo.thi.old@saoviet-old.example')).toBe(true);
    expect(source('figma').rows.some((r) => r.identifier === emailOf('NV-DES8'))).toBe(false);
  });

  it('grants the seats the rules judge before the grace of a new seat and the 90-day tier', () => {
    for (const code of ['NV-DES1', 'NV-DES2', 'NV-DES3', 'NV-DESH', 'NV-DES4', 'NV-DES11', 'NV-OFF1']) {
      const seat = F.seats.find((s) => s.subscription === 'figma' && s.holder === code);
      expect(seat?.grantedDaysAgo ?? 130).toBeGreaterThanOrEqual(90);
    }
  });

  it('has a decision of each kind the head can take, and the events of the people who feed the rules', () => {
    expect(new Set(F.ghostDecisions.map((d) => d.choice))).toEqual(new Set(['KEEP', 'RECLAIM', 'EXEMPT']));
    expect(F.ghostDecisions.some((d) => d.holder === 'NV-DESH')).toBe(true);
    expect(F.personnel.map((e) => e.kind).sort()).toEqual(['LONG_LEAVE', 'OFFBOARDING']);
    for (const d of F.ghostDecisions) expect(person(d.holder).department).toBe('DES');
  });

  it('records a departure only of a person who heads no department: the seed names no successor, and a head who leaves must have one (QĐ-110h)', () => {
    const heads = new Set(F.departments.flatMap((d) => (d.head ? [d.head] : [])));
    for (const event of F.personnel.filter((e) => e.kind === 'OFFBOARDING'))
      expect(heads.has(event.employee)).toBe(false);
  });
});

describe('shared dataset v4: the documentation', () => {
  it('documents every account with its final role and head scope, and a separate bootstrap identity', () => {
    const readme = readFileSync(join(__dirname, 'shared-demo-v4/README.md'), 'utf8').replace(/ {2,}/g, ' ');
    expect(readme).toContain(INSTALLATION.loginEmail);
    expect(readme).toContain('ADMIN');
    for (const p of F.people) {
      const role = p.code === F.approvalRoles.SPENDING_APPROVER ? 'SPENDING_APPROVER' : (p.account ?? '-');
      const email = p.account ? `${p.email}@${F.emailDomain}` : 'no account';
      const head = F.departments.find((d) => d.head === p.code)?.code ?? '-';
      expect(readme).toContain(`| ${p.code} | ${p.fullName} | ${email} | ${role} | ${p.department} | ${head} |`);
    }
  });
});
