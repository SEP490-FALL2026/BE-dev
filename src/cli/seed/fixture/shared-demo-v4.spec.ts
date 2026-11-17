import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { dayOffset, endOfMonth } from '../demo-dates';
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
      'NV-ITA4',
    ]);
  });

  it('has exactly one Finance, one spending approver prepared as EMPLOYEE for the role step, and a Cost Center for all but Operations', () => {
    expect(F.people.filter((p) => p.account === 'FINANCE')).toHaveLength(1);
    expect(person(F.approvalRoles.SPENDING_APPROVER).account).toBe('EMPLOYEE');
    expect(F.departments.filter((d) => d.costCenter === null).map((d) => d.code)).toEqual(['OPS']);
  });

  it('adds seventeen people of SPEC S01, one of them left unplaced, with the accounts the scenarios need (T1)', () => {
    const added = [
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
    ];
    expect(F.people).toHaveLength(41 + 17);
    expect(added.map((code) => person(code).code)).toEqual(added);
    expect(F.people.filter((p) => p.department === null).map((p) => p.code)).toEqual(['NV-NEW2']);
    expect(F.people.filter((p) => p.account !== null)).toHaveLength(30 + 12);
    const withoutAccount = added.filter((code) => person(code).account === null);
    expect(withoutAccount).toEqual(['NV-BOD5', 'NV-BOD6', 'NV-SAL3', 'NV-SAL4', 'NV-NEW3']);
    expect(person('NV-NEW2').account).toBe('EMPLOYEE');
    expect(person('NV-BOD3').account).toBe('EMPLOYEE');
    for (const [code, dept] of [
      ['NV-DEV7', 'ENG'],
      ['NV-ITO2', 'ITO'],
      ['NV-FIN2', 'FIN'],
      ['NV-BOD6', 'BOD'],
      ['NV-SAL4', 'SAL'],
      ['NV-OPS2', 'OPS'],
      ['NV-NEW3', 'BOD'],
    ]) {
      expect(person(code).department).toBe(dept);
    }
  });

  it('has enough people in one department for a group', () => {
    expect(F.people.filter((p) => p.department === 'ENG').length).toBeGreaterThanOrEqual(5);
  });
});

describe('shared dataset v4: the catalog and the shared pool', () => {
  it('has one subscription per plan of the catalog except the internal one and Skype, which is retired (T6)', () => {
    const plans = F.applications
      .flatMap((app) => app.plans)
      .filter((p) => p.provisioningType !== 'K5' && p.key !== 'skype-online');
    expect(F.subscriptions.map((s) => s.plan).sort()).toEqual(plans.map((p) => p.key).sort());
    expect(F.subscriptions).toHaveLength(29);
  });

  it('holds 25 applications of 32 plans, named as they are sold, with none of the three the budget scenarios refuse (T4, S04)', () => {
    expect(F.applications).toHaveLength(25);
    expect(F.applications.flatMap((app) => app.plans)).toHaveLength(32);
    expect(F.applications.filter((app) => app.kind === 'SAAS')).toHaveLength(23);
    expect(F.applications.filter((app) => app.kind === 'INTERNAL')).toHaveLength(2);
    const names = F.applications.map((app) => app.name.toLowerCase());
    for (const refused of ['miro', 'whimsical', 'canva enterprise']) expect(names).not.toContain(refused);
    expect(new Set(F.applications.map((app) => app.key)).size).toBe(25);
    expect(new Set(F.applications.map((app) => app.name)).size).toBe(25);
    const planNames = F.applications.flatMap((app) => app.plans.map((p) => p.name));
    expect(new Set(planNames).size).toBe(32);
    expect(new Set(F.applications.flatMap((app) => app.plans.map((p) => p.key))).size).toBe(32);
  });

  it('gives each plan the kind of control and sharing its application needs, and a note to a plan that loses data (T4)', () => {
    expect(plan('copilot-pro')).toMatchObject({ provisioningType: 'K1', controlLevel: 'UNCONTROLLABLE' });
    expect(plan('visio-pro')).toMatchObject({
      provisioningType: 'K4',
      hasAdminConsole: true,
      sharingPolicy: 'ALLOWED',
    });
    expect(plan('sublime-license')).toMatchObject({ provisioningType: 'K4' });
    expect(plan('sublime-license').hasAdminConsole).toBeUndefined();
    expect(plan('adobe-cc-teams').dataLossOnRemoval).toBe(true);
    expect(plan('adobe-cc-teams').revocationNote).toBeTruthy();
    expect(plan('attendance-access').provisioningType).toBe('K5');
    for (const declared of F.applications.flatMap((app) => app.plans).filter((p) => p.dataLossOnRemoval)) {
      expect(declared.revocationNote).toBeTruthy();
    }
  });

  it('keeps Zoom and Skype in the group the usage rules never collect (T4)', () => {
    const group = (key: string) => F.applications.find((app) => app.key === key)!.functionalGroup;
    expect(group('zoom')).toBe('Liên lạc (email, chat, họp)');
    expect(group('skype')).toBe('Liên lạc (email, chat, họp)');
  });

  it('covers K1, K2 with free seats and a sold-out plan, K4 with and without keys, and K5', () => {
    const types = new Set(F.applications.flatMap((app) => app.plans.map((p) => p.provisioningType)));
    expect([...types].sort()).toEqual(['K1', 'K2', 'K4', 'K5']);
    expect(subscriptionOf('postman-professional').freeAfterBaseline).toBeGreaterThan(0);
    expect(subscriptionOf('onepassword-business').freeAfterBaseline).toBe(0);
    expect(F.keys.find((k) => k.subscription === 'jetbrains')?.count).toBeGreaterThan(0);
    expect(F.keys.some((k) => k.subscription === 'datagrip')).toBe(false);
  });

  it('commits for a year to seven annual subscriptions, and prices every subscription in dong (the dollar prices of Cursor, Claude Pro and Copilot Pro stay beside it as the original price)', () => {
    const annual = F.subscriptions.filter((s) => s.billingCycle === 'ANNUAL' && s.kind === 'TERM');
    expect(annual.map((s) => s.key).sort()).toEqual([
      'adobe-cc-teams',
      'claude-team',
      'confluence-premium',
      'figma',
      'm365-standard',
      'notion-plus',
      'zoom-business',
    ]);
    for (const declared of annual) expect(declared.termMonths).toBe(12);
    expect(subscriptionOf('figma-professional')).toMatchObject({ termMonths: 12, renewalInDays: 50 });
    // QĐ-111an: a price is written in dong only; no rate is recorded any more (the route is gone), so the fixture holds none.
    expect(F.subscriptions.filter((s) => s.unitPrice.currency !== F.currency)).toEqual([]);
    expect(F).not.toHaveProperty('exchangeRates');
    // 20 USD at the 25.400 the dataset once recorded for the day: the same price, in dong.
    expect(
      F.subscriptions
        .filter((s) => s.originalPrice !== undefined)
        .map((s) => s.key)
        .sort(),
    ).toEqual(['claude-pro', 'copilot-pro', 'cursor']);
    expect(subscriptionOf('cursor-pro')).toMatchObject({
      unitPrice: { amount: '508000', currency: 'VND' },
      originalPrice: { amount: '20', currency: 'USD' },
    });
    expect(subscriptionOf('claude-pro')).toMatchObject({
      unitPrice: { amount: '508000' },
      originalPrice: { amount: '20' },
    });
    expect(subscriptionOf('copilot-pro')).toMatchObject({
      unitPrice: { amount: '254000' },
      originalPrice: { amount: '10' },
    });
  });

  it('puts each new subscription inside or outside the window of adjustment of SBF-20 as the demo needs on any day (T6, SPEC 4.5)', () => {
    const monthlyWindow = 7;
    const annualWindow = 30;
    const insideMonthly = (key: string) => subscriptionOf(key).renewalInDays! <= monthlyWindow;
    const insideAnnual = (key: string) => {
      const declared = subscriptionOf(key);
      const deadline = declared.noticeDeadlineInDays ?? declared.renewalInDays! - (declared.noticePeriodDays ?? 30);

      return deadline <= annualWindow;
    };
    for (const key of ['zoom-pro', 'confluence-standard', 'hubspot-starter']) expect(insideMonthly(key)).toBe(true);
    for (const key of ['m365-basic', 'notion-business', 'adobe-photoshop', 'jira-standard', 'slack-pro']) {
      expect(insideMonthly(key)).toBe(false);
    }
    for (const key of ['figma-professional', 'notion-plus', 'confluence-premium', 'adobe-cc-teams']) {
      expect(insideAnnual(key)).toBe(true);
    }
    expect(insideAnnual('m365-standard')).toBe(false);
    // Adobe is red (7 days before the deadline) on the day of the seed; Notion Plus is not yet (its deadline is 15 days away).
    expect(subscriptionOf('adobe-cc-teams').renewalInDays! - 30).toBeLessThanOrEqual(7);
    expect(subscriptionOf('notion-plus').renewalInDays! - 30).toBeGreaterThan(7);
    expect(subscriptionOf('confluence-premium')).toMatchObject({ renewalInDays: 70, noticeDeadlineInDays: 25 });
    expect(subscriptionOf('zoom-business')).toMatchObject({ renewalInDays: -3 });
    expect(subscriptionOf('claude-team')).toMatchObject({ withoutDates: true });
    expect(subscriptionOf('hubspot-starter').renewalInDays).toBe(1);
  });

  it('leaves the stock of the new K1, K4 plans as the plan needs and the K1 plans for ENG (T6)', () => {
    for (const key of ['claude-pro', 'copilot-pro']) {
      expect(subscriptionOf(key)).toMatchObject({ quantity: 0, ownerDepartment: 'ENG', responsible: 'NV-ITA1' });
    }
    expect(subscriptionOf('visio-pro')).toMatchObject({ kind: 'PERPETUAL', quantity: 3 });
    expect(subscriptionOf('sublime-license')).toMatchObject({ kind: 'PERPETUAL', quantity: 2 });
    expect(subscriptionOf('adobe-cc-teams').responsible).toBe('NV-ITA2');
    expect(subscriptionOf('notion-business').responsible).toBe('NV-ITA2');
    // Each subscription is named by the key of its plan (SPEC 4.4), the first thirteen by the key they have always had.
    for (const declared of F.subscriptions.slice(13)) expect(declared.key).toBe(declared.plan);
  });

  it('declares no application of the old kind and no pricing model: the system works both out from the plan (CT-1, B-5)', () => {
    expect(F.applications.map((app) => app.kind)).not.toContain('LICENSED');
    for (const declared of F.applications.flatMap((app) => app.plans))
      expect(declared).not.toHaveProperty('pricingModel');
  });

  it('buys a plan of one purchase (K4) once and every other plan over a term: only a perpetual subscription is written for K4 (B-5)', () => {
    for (const declared of F.subscriptions) {
      expect(declared.kind === 'PERPETUAL').toBe(plan(declared.plan).provisioningType === 'K4');
    }
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

describe('shared dataset v4: the functional groups', () => {
  it('puts at least one application in each of the seven groups the installation writes (C-O5)', () => {
    expect(new Set(F.applications.map((application) => application.functionalGroup))).toEqual(
      new Set([
        'Trợ lý AI',
        'Thiết kế & sáng tạo',
        'Lập trình & kỹ thuật',
        'Văn phòng & cộng tác',
        'Chuyên ngành',
        'Khác',
        'Liên lạc (email, chat, họp)',
      ]),
    );
  });
});

describe('shared dataset v4: the budgets', () => {
  it('has an approved budget of the year for every department with a Cost Center and a head, and only for them', () => {
    // A department with no head sends no BM-10; its version from the baseline waits for the deadline (D-Z2-2).
    expect(F.budgets.map((b) => b.department).sort()).toEqual(
      F.departments
        .filter((d) => d.costCenter !== null && d.head !== null)
        .map((d) => d.code)
        .sort(),
    );
    expect(department('LGL').head).toBeNull();
  });

  it('makes the three outcomes of the budget check come out whatever the day', () => {
    // A request for one month costs one month of the price, whichever day it is sent on.
    const cost = (key: string) => {
      const request = F.requests.find((r) => r.key === key)!;
      expect(request.termMonths).toBe(1);

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

  it('keeps the versions of every year within the annual ceiling less the reserve of the shared pool (10 % reserve each)', () => {
    const withReserve = (base: string) => (BigInt(base) * 11n) / 10n;
    const sum = (bases: string[]) => bases.reduce((total, base) => total + withReserve(base), 0n);
    const room = (cycle: typeof F.cycle) => BigInt(cycle.annualCeiling) - BigInt(cycle.sharedPoolReserve);
    expect(sum(F.budgets.map((b) => b.base))).toBeLessThanOrEqual(room(F.cycle));
    const versions = F.nextYear.filter((n) => n.stage !== 'PROPOSAL_SUBMITTED');
    expect(sum(versions.map((n) => n.base))).toBeLessThanOrEqual(room(F.nextCycle));
  });

  it('leaves the next year at every stage (DEMO-15), opens the year and the next, and keeps the year after a draft', () => {
    expect(new Set(F.nextYear.map((n) => n.stage))).toEqual(
      new Set(['PROPOSAL_SUBMITTED', 'VERSION_SENT', 'VERSION_RETURNED', 'APPROVED']),
    );
    expect(F.nextYear.find((n) => n.stage === 'VERSION_RETURNED')?.reason).toBeTruthy();
    // Some departments with a head send nothing for the next year: the flag of no proposal.
    const heads = F.departments.filter((d) => d.costCenter !== null && d.head !== null).map((d) => d.code);
    expect(heads.filter((code) => !F.nextYear.some((n) => n.department === code)).length).toBeGreaterThan(0);
    expect([F.cycle.open, F.nextCycle.open, F.draftCycle.open]).toEqual([true, true, false]);
    // The cycle of the year is open on the day of the seed and locked from the next (adjustments, FIX-AD1-Q2).
    expect(F.cycle.submissionOffsetDays).toBe(0);
    for (const cycle of [F.cycle, F.nextCycle, F.draftCycle]) {
      expect(cycle.decisionOffsetDays).toBeGreaterThanOrEqual(cycle.submissionOffsetDays);
    }
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
    // RQ-2 (QĐ-111i): a request names months, not a date. The contractor's right is cut at the end of the contract the Super Admin
    // recorded for the person, so it is the contract that puts the end 20 days away; the other right runs its two months.
    const contractor = person('NV-CTR1');
    expect(contractor.employmentType).toBe('CONTRACTOR');
    expect(contractor.contractEndInDays).toBe(20);
    expect(contractor.contractEndInDays).toBeLessThanOrEqual(30);
    expect(F.requests.find((r) => r.requester === 'NV-CTR1')?.termMonths).toBeGreaterThanOrEqual(1);
    expect(F.requests.find((r) => r.key === 'R17')?.termMonths).toBe(2);
  });

  it('asks for the time of use the kind of plan wants (QĐ-111i): K1 1 to 9 months, K2/K5 1 to 12 or none, K4 none, and months for a person with a term', () => {
    const typeOf = (key: string) => (key ? plan(key).provisioningType : null);
    const withTerm = new Set(F.people.filter((p) => p.employmentType !== 'STAFF').map((p) => p.code));
    for (const request of [...F.requests, { ...F.draft, key: 'draft' }]) {
      const type = typeOf(request.plan ?? '');
      if (type === 'K1') expect(request.termMonths).toBeGreaterThanOrEqual(1);
      if (type === 'K1') expect(request.termMonths).toBeLessThanOrEqual(9);
      if (type === 'K4') expect(request.termMonths).toBeNull();
      if (typeof request.termMonths === 'number') {
        expect(request.termMonths).toBeGreaterThanOrEqual(1);
        expect(request.termMonths).toBeLessThanOrEqual(12);
      }
      // A person with a term never gets a right with no end: 422 TERM_LONG_TERM_NOT_ALLOWED.
      if (withTerm.has(request.requester) && type !== 'K4') expect(request.termMonths).not.toBeNull();
    }
  });

  it('saves a draft in a department with no Cost Center, which can only stay a draft', () => {
    expect(department(person(F.draft.requester).department!).costCenter).toBeNull();
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
    expect(F.personnel.map((e) => e.kind).sort()).toEqual(['LONG_LEAVE', 'OFFBOARDING', 'OFFBOARDING', 'TRANSFER']);
    for (const d of F.ghostDecisions) expect(person(d.holder).department).toBe('DES');
  });

  it('records a departure or a transfer only of a person who heads no department: the seed names no successor, and a head who leaves must have one (QĐ-110h)', () => {
    const heads = new Set(F.departments.flatMap((d) => (d.head ? [d.head] : [])));
    for (const event of F.personnel.filter((e) => e.kind !== 'LONG_LEAVE'))
      expect(heads.has(event.employee)).toBe(false);
  });
});

describe('shared dataset v4: MF-2, MF-3 and the IT Admins (QĐ-110, QĐ-111)', () => {
  const event = <K extends (typeof F.personnel)[number]['kind']>(kind: K, employee: string) =>
    F.personnel.find((e) => e.kind === kind && e.employee === employee) as Extract<
      (typeof F.personnel)[number],
      { kind: K }
    >;

  it('has an IT Admin who leaves on a day ahead, answers for a subscription, owns its workspace and is in charge of no department (P5)', () => {
    const leaving = event('OFFBOARDING', 'NV-ITA4');
    expect(leaving.lastDayInWorkingDays).toBeGreaterThan(0);
    expect(person('NV-ITA4').account).toBe('IT_ADMIN');
    expect(F.subscriptions.filter((s) => s.responsible === 'NV-ITA4').map((s) => s.plan)).toEqual([
      'mailchimp-standard',
    ]);
    expect(plan('mailchimp-standard').vendorAdmin).toBe('NV-ITA3');
    expect(F.departments.some((d) => d.itAdmin === 'NV-ITA4')).toBe(false);
  });

  it('blocks NV-OFF1 today with a K1 seat, so his revocations show the K1 checklist (D-62)', () => {
    expect(event('OFFBOARDING', 'NV-OFF1').lastDayInWorkingDays).toBeUndefined();
    const k1 = F.subscriptions.filter((s) => plan(s.plan).provisioningType === 'K1').map((s) => s.key);
    expect(F.seats.some((s) => k1.includes(s.subscription) && s.holder === 'NV-OFF1')).toBe(true);
    expect(subscriptionOf('grammarly-pro').quantity).toBe(F.seats.filter((s) => s.subscription === 'grammarly').length);
    // The K1 plans of the MF-5 reduction flows start with no seat of the baseline: those flows count their seats.
    expect(F.seats.some((s) => s.subscription === 'chatgpt' || s.subscription === 'cursor')).toBe(false);
  });

  it('moves a person with paid seats tomorrow, the earliest day after the placement of today, and not the person the MF-3 flow moves', () => {
    const transfer = F.personnel.find((e) => e.kind === 'TRANSFER')!;
    expect(transfer).toMatchObject({ employee: 'NV-DEV4', toDepartment: 'ITO', effectiveInDays: 1 });
    expect(person('NV-DEV4').account).not.toBeNull();
    expect(F.seats.filter((s) => s.holder === 'NV-DEV4').length).toBeGreaterThan(0);
    expect(transfer.employee).not.toBe('NV-CTR1');
  });

  it('records a workspace profile for a K4 plan with an admin console and leaves one K2 plan without the company account (QĐ-110k, QĐ-110u)', () => {
    expect(plan('jetbrains-all')).toMatchObject({ provisioningType: 'K4', hasAdminConsole: true });
    expect(plan('jetbrains-datagrip').hasAdminConsole).toBeUndefined();
    const flagged = F.applications.flatMap((a) => a.plans).filter((p) => p.withoutOwnerAccountEmail);
    expect(flagged.map((p) => [p.key, p.provisioningType]).sort()).toEqual([
      ['canva-teams', 'K2'],
      ['notion-business', 'K2'],
    ]);
  });

  it('lists software for departments with an IT Admin, from the catalog, and proposes only what their list does not hold (P16–P18)', () => {
    const apps = new Set(F.applications.map((a) => a.key));
    for (const list of F.departmentSoftware) {
      expect(department(list.department).itAdmin).not.toBeNull();
      for (const item of list.items) {
        expect(apps.has(item.application)).toBe(true);
        if (item.plan)
          expect(F.applications.find((a) => a.key === item.application)!.plans.map((p) => p.key)).toContain(item.plan);
      }
    }
    expect(F.softwareProposals.map((p) => p.outcome).sort()).toEqual(['PENDING', 'REJECTED']);
    for (const proposal of F.softwareProposals) {
      expect(department(proposal.department).head).not.toBeNull();
      const listed = F.departmentSoftware.find((l) => l.department === proposal.department)?.items ?? [];
      expect(listed.some((i) => i.application === proposal.application && i.plan === proposal.plan)).toBe(false);
      if (proposal.outcome === 'REJECTED') expect(proposal.rejectionReason).toBeTruthy();
    }
  });

  it('has a request for internal software in the department with no head, granted by IT without a need step (QĐ-111bc)', () => {
    const headless = F.departments.find((d) => d.head === null)!.code;
    expect(
      F.requests.some(
        (r) =>
          person(r.requester).department === headless &&
          plan(r.plan ?? '')?.provisioningType === 'K5' &&
          r.target === 'COMPLETED',
      ),
    ).toBe(true);
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
      expect(readme).toContain(`| ${p.code} | ${p.fullName} | ${email} | ${role} | ${p.department ?? '-'} | ${head} |`);
    }
  });
});
