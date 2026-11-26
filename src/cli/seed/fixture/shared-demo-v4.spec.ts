import { SHARED_DEMO_V4 as F } from './shared-demo-v4';
import { subscriptionHasPlan, subscriptionMonthlyPriceOf } from '../steps/catalog.steps';

const person = (code: string) => F.people.find((candidate) => candidate.code === code)!;
const plan = (key: string) => F.applications.flatMap((app) => app.plans).find((candidate) => candidate.key === key)!;
const subscriptionOf = (planKey: string) =>
  F.subscriptions.find((candidate) => subscriptionHasPlan(candidate, planKey))!;
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

  it('adds seventeen people of SPEC S01, one unplaced, and NV-NEW4 placed in the future (T1, QĐ-113e)', () => {
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
    expect(F.people).toHaveLength(41 + 17 + 1);
    expect(added.map((code) => person(code).code)).toEqual(added);
    expect(F.people.filter((p) => p.department === null).map((p) => p.code)).toEqual(['NV-NEW2', 'NV-NEW4']);
    expect(F.people.filter((p) => p.account !== null)).toHaveLength(30 + 12);
    expect(added.filter((code) => person(code).account === null)).toEqual([
      'NV-BOD5',
      'NV-BOD6',
      'NV-SAL3',
      'NV-SAL4',
      'NV-NEW3',
    ]);
    const placed = F.people.filter((p) => p.firstPlacement !== undefined);
    expect(placed.map((p) => p.code)).toEqual(['NV-NEW4']);
    expect(placed[0].firstPlacement!.effectiveInDays).toBeGreaterThan(0);
    expect(department(placed[0].firstPlacement!.department)).toBeDefined();
    expect(F.requests.some((r) => [r.requester, ...(r.beneficiaries ?? [])].includes('NV-NEW4'))).toBe(false);
    expect(F.seats.some((seat) => seat.holder === 'NV-NEW4')).toBe(false);
    expect(F.people.filter((p) => p.department === 'ENG').length).toBeGreaterThanOrEqual(5);
  });
});

describe('shared dataset v4: the catalog and the shared pool (W3-28)', () => {
  it('declares K2 subscriptions only (no K1, K4, K5, or retired Skype subscriptions)', () => {
    const k2ActivePlans = F.applications
      .flatMap((app) => app.plans)
      .filter((p) => p.provisioningType === 'K2' && p.key !== 'skype-online')
      .map((p) => p.key)
      .sort();
    const coveredPlans = F.subscriptions.flatMap((s) => (s.lines ? s.lines.map((l) => l.plan) : [s.plan!])).sort();

    expect(coveredPlans).toEqual(k2ActivePlans);
    // 21 K2 plans across 20 subscriptions (Claude Team combines 2 lines into 1 subscription); 0 K1 subscriptions.
    expect(F.subscriptions).toHaveLength(20);
    expect(F.subscriptions.filter((s) => !s.lines && plan(s.plan!).provisioningType === 'K1')).toEqual([]);
  });

  it('gives every paid plan a reference price in dong and sets Claude Pro annual K1 commitment to 12 (QĐ-113a, P13a)', () => {
    for (const declared of F.applications.flatMap((app) => app.plans)) {
      if (declared.provisioningType === 'K5' || declared.key === 'skype-online') {
        expect(declared.referencePrice).toBeUndefined();
        continue;
      }
      if (declared.keyBinding === 'DEVICE_BUNDLED') {
        expect(declared.referencePrice).toBeUndefined();
        continue;
      }
      expect(BigInt(declared.referencePrice!)).toBeGreaterThan(0n);
      const firstLot = F.lots.find((lot) => lot.plan === declared.key);
      if (firstLot) expect(declared.referencePrice).toBe(firstLot.unitPrice.amount);
      const subscription = F.subscriptions.find((s) => subscriptionHasPlan(s, declared.key));
      if (subscription) {
        expect(Number(declared.referencePrice!)).toBe(subscriptionMonthlyPriceOf(subscription, declared.key));
      }
    }
    expect(plan('claude-pro')).toMatchObject({ referencePrice: '508000', referenceCommitmentMonths: 12 });
    expect(plan('grammarly-business')).toMatchObject({ provisioningType: 'K1', referencePrice: '360000' });
    expect(plan('claude-team-standard').referencePrice).toBe('500000');
    expect(plan('claude-team-premium').referencePrice).toBe('2500000');
    expect(plan('jetbrains-all').referencePrice).toBe('6000000');
  });

  it('merges Claude Team into 1 subscription of 2 lines (Standard 10, Premium 2) with minimumSeatsTotal 2 and no dates (L-6)', () => {
    const claude = F.subscriptions.find((s) => s.key === 'claude-team')!;
    expect(claude).toMatchObject({
      billingCycle: 'ANNUAL',
      termMonths: 12,
      withoutDates: true,
      autoRenew: false,
      minimumSeatsTotal: 2,
      responsible: 'NV-ITA1',
    });
    expect(claude.noticeDeadlineInDays).toBeUndefined();
    expect(claude.lines).toEqual([
      { plan: 'claude-team-standard', monthlyUnitPrice: { amount: '500000', currency: 'VND' }, freeAfterBaseline: 8 },
      { plan: 'claude-team-premium', monthlyUnitPrice: { amount: '2500000', currency: 'VND' }, quantity: 2 },
    ]);
    expect(
      F.seats
        .filter((s) => s.subscription === 'claude-team')
        .map((s) => s.holder)
        .sort(),
    ).toEqual(['NV-DEV6', 'NV-ITO1']);
    expect(F.requests.find((r) => r.key === 'R63')).toMatchObject({
      requester: 'NV-DEV5',
      plan: 'claude-team-premium',
      target: 'COMPLETED',
      grant: 'POOL',
    });
  });

  it('applies vendor comparison rules (L-2 Figma & Jira MEMBERS+invoicedLater, QĐ-119e Jira 255k, Zoom Business tier 50)', () => {
    expect(subscriptionOf('jira-standard')).toMatchObject({
      billingCycle: 'MONTHLY',
      termMonths: 1,
      unitPrice: { amount: '255000', currency: 'VND' },
      freeAfterBaseline: 4,
      seatCounting: 'MEMBERS',
      invoicedLater: true,
    });
    expect(subscriptionOf('figma-professional')).toMatchObject({
      billingCycle: 'MONTHLY',
      termMonths: 1,
      unitPrice: { amount: '375000', currency: 'VND' },
      seatCounting: 'MEMBERS',
      invoicedLater: true,
    });
    expect(subscriptionOf('zoom-business')).toMatchObject({
      billingCycle: 'ANNUAL',
      termMonths: 12,
      unitPrice: { amount: '1800000', currency: 'VND' },
      minimumSeats: 50,
      freeAfterBaseline: 49,
      renewalInDays: -3,
    });
  });

  it('holds 27 applications of 36 plans with K1, K2, K4 lots, and K5 covered cleanly', () => {
    expect(F.applications).toHaveLength(27);
    expect(F.applications.flatMap((app) => app.plans)).toHaveLength(36);
    expect(new Set(F.applications.map((app) => app.name)).size).toBe(27);
    expect(new Set(F.applications.flatMap((app) => app.plans.map((p) => p.name))).size).toBe(36);
    expect(F.applications.map((app) => app.kind)).not.toContain('LICENSED');
    expect(subscriptionOf('postman-professional').freeAfterBaseline).toBeGreaterThan(0);
    expect(subscriptionOf('onepassword-business').freeAfterBaseline).toBe(0);
    expect(subscriptionOf('canva-teams').freeAfterBaseline).toBe(2);
    expect(F.keys.find((k) => k.lot === 'jetbrains')?.count).toBeGreaterThan(0);
    expect(F.keys.some((k) => k.lot === 'datagrip')).toBe(false);
    expect(F.subscriptions.filter((s) => s.unitPrice && s.unitPrice.currency !== F.currency)).toEqual([]);
    expect(F).not.toHaveProperty('exchangeRates');
  });

  it('puts each annual and monthly subscription inside/outside SBF-20 adjustment windows as needed (T6)', () => {
    const annual = F.subscriptions.filter((s) => s.billingCycle === 'ANNUAL' && s.kind === 'TERM');
    expect(annual.map((s) => s.key).sort()).toEqual([
      'adobe-cc-teams',
      'claude-team',
      'confluence-premium',
      'm365-standard',
      'notion-plus',
      'zoom-business',
    ]);
    for (const declared of annual) expect(declared.termMonths).toBe(12);
    for (const key of ['zoom-pro', 'confluence-standard', 'hubspot-starter']) {
      expect(subscriptionOf(key).renewalInDays!).toBeLessThanOrEqual(7);
    }
    for (const key of [
      'm365-basic',
      'notion-business',
      'adobe-photoshop',
      'jira-standard',
      'figma-professional',
      'slack-pro',
    ]) {
      expect(subscriptionOf(key).renewalInDays!).toBeGreaterThan(7);
    }
    for (const key of ['notion-plus', 'confluence-premium', 'adobe-cc-teams']) {
      const s = subscriptionOf(key);
      const deadline = s.noticeDeadlineInDays ?? s.renewalInDays! - (s.noticePeriodDays ?? 30);
      expect(deadline).toBeLessThanOrEqual(30);
    }
  });

  it('buys K4 plans only as lots (JetBrains twice, Visio/Sublime/DataGrip/Office H&B once, Windows bundled never)', () => {
    for (const lot of F.lots) {
      expect(plan(lot.plan)).toMatchObject({ provisioningType: 'K4' });
      expect(lot.purpose).toBe(plan(lot.plan).keyBinding === 'DEVICE_KEY' ? 'STOCK' : 'REPLACEMENT');
    }
    expect(F.lots.filter((lot) => lot.plan === 'jetbrains-all')).toHaveLength(2);
    expect(F.lots.filter((lot) => lot.plan === 'jetbrains-datagrip')).toHaveLength(1);
    expect(F.lots.some((lot) => lot.plan === 'windows-11-pro-oem')).toBe(false);
    expect(F.keys).toContainEqual({ lot: 'visio-pro', count: 3 });
    expect(F.keys).toContainEqual({ lot: 'sublime-license', count: 2 });
  });

  it('holds valid baseline seats without asking twice and leaves enough free pool seats for pool grants', () => {
    const held = new Set<string>();
    for (const seat of F.seats) {
      expect(F.subscriptions.map((s) => s.key)).toContain(seat.subscription);
      expect(person(seat.holder)).toBeDefined();
      expect(held.has(`${seat.subscription}:${seat.holder}`)).toBe(false);
      held.add(`${seat.subscription}:${seat.holder}`);
    }
    const ended = F.seats.filter((seat) => seat.endInDays !== undefined && seat.endInDays < 0);
    expect(ended.map((seat) => `${seat.subscription}:${seat.holder}`).sort()).toEqual([
      'confluence-standard:NV-ITO2',
      'zoom-pro:NV-SAL4',
    ]);
    for (const request of F.requests) {
      const subscription = request.plan
        ? F.subscriptions.find((s) => subscriptionHasPlan(s, request.plan!))
        : undefined;
      if (!subscription) continue;
      for (const code of request.beneficiaries ?? [request.requester]) {
        expect(F.seats.some((s) => s.subscription === subscription.key && s.holder === code)).toBe(false);
      }
    }
    const drawn = new Map<string, number>();
    const draws = ['COMPLETED', 'AWAITING_EXECUTION', 'EXECUTING', 'FAILED'];
    for (const request of F.requests) {
      if (!request.plan || request.grant === 'PURCHASE' || !draws.includes(request.target)) continue;
      const subscription = F.subscriptions.find((s) => subscriptionHasPlan(s, request.plan!));
      if (!subscription) continue;
      const lineKey = subscription.lines ? request.plan : subscription.key;
      drawn.set(lineKey, (drawn.get(lineKey) ?? 0) + (request.beneficiaries?.length ?? 1));
    }
    for (const [key, used] of drawn) {
      const sub = F.subscriptions.find((s) => s.key === key || s.lines?.some((l) => l.plan === key))!;
      const free = sub.lines
        ? (sub.lines.find((l) => l.plan === key)!.quantity ??
          sub.lines.find((l) => l.plan === key)!.freeAfterBaseline ??
          0)
        : sub.freeAfterBaseline;
      expect(free).toBeGreaterThanOrEqual(used);
    }
  });

  it('puts at least one application in each of the seven functional groups (C-O5)', () => {
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
