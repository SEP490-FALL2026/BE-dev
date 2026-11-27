import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { subscriptionHasPlan } from '../steps/catalog.steps';
import { INSTALLATION } from './shared-demo-v4/installation';
import { SHARED_DEMO_V4 as F } from './shared-demo-v4';

const person = (code: string) => F.people.find((candidate) => candidate.code === code)!;
const plan = (key: string) => F.applications.flatMap((app) => app.plans).find((candidate) => candidate.key === key)!;
const subscriptionOf = (planKey: string) =>
  F.subscriptions.find((candidate) => subscriptionHasPlan(candidate, planKey))!;

describe('shared dataset v4: restored catalog, baseline seat & cycle coverage', () => {
  it('holds 25 SAAS and 2 INTERNAL applications with unique keys, no refused names, and no pricingModel property', () => {
    expect(F.applications.filter((app) => app.kind === 'SAAS')).toHaveLength(25);
    expect(F.applications.filter((app) => app.kind === 'INTERNAL')).toHaveLength(2);
    const names = F.applications.map((app) => app.name.toLowerCase());
    for (const refused of ['miro', 'whimsical', 'canva enterprise']) expect(names).not.toContain(refused);
    expect(new Set(F.applications.map((app) => app.key)).size).toBe(27);
    expect(new Set(F.applications.flatMap((app) => app.plans.map((p) => p.key))).size).toBe(36);
    expect(F.applications.map((app) => app.kind)).not.toContain('LICENSED');
    for (const declared of F.applications.flatMap((app) => app.plans)) {
      expect(declared).not.toHaveProperty('pricingModel');
    }
  });

  it('gives each plan the kind of control, sharing, revocation note, and communication grouping its application needs', () => {
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
    const group = (key: string) => F.applications.find((app) => app.key === key)!.functionalGroup;
    expect(group('zoom')).toBe('Liên lạc (email, chat, họp)');
    expect(group('skype')).toBe('Liên lạc (email, chat, họp)');
  });

  it('keeps SBF-20 adjustment timing details, responsible IT admins, and K4 stock counts intact', () => {
    expect(subscriptionOf('adobe-cc-teams').renewalInDays! - 30).toBeLessThanOrEqual(7);
    expect(subscriptionOf('notion-plus').renewalInDays! - 30).toBeGreaterThan(7);
    expect(subscriptionOf('confluence-premium')).toMatchObject({ renewalInDays: 70, noticeDeadlineInDays: 25 });
    expect(subscriptionOf('zoom-business')).toMatchObject({ renewalInDays: -3 });
    expect(subscriptionOf('claude-team-standard')).toMatchObject({ withoutDates: true });
    expect(subscriptionOf('hubspot-starter').renewalInDays).toBe(1);
    expect(F.lots.find((lot) => lot.key === 'visio-pro')).toMatchObject({ licenseCount: 3 });
    expect(F.lots.find((lot) => lot.key === 'sublime-license')).toMatchObject({ licenseCount: 2 });
    expect(subscriptionOf('adobe-cc-teams').responsible).toBe('NV-ITA2');
    expect(subscriptionOf('notion-business').responsible).toBe('NV-ITA2');
    for (const declared of F.subscriptions.slice(11)) {
      if (!declared.lines) expect(declared.key).toBe(declared.plan);
    }
  });

  it('isolates added baseline seats to T1 people and four heads while putting Adobe and Zoom Pro on BOD not MKT', () => {
    const oldKeys = new Set([
      'jira',
      'figma',
      'slack',
      'github',
      'onepassword',
      'postman',
      'mailchimp',
      'canva',
      'chatgpt',
      'cursor',
      'grammarly',
      'jetbrains',
      'datagrip',
    ]);
    const added = F.seats.filter((seat) => !oldKeys.has(seat.subscription));
    expect(added.length).toBeGreaterThan(0);
    for (const seat of added) expect(person(seat.holder).department).not.toBe('MKT');
    expect(added.some((seat) => person(seat.holder).department === 'DES')).toBe(false);

    const holders = (key: string) => F.seats.filter((seat) => seat.subscription === key).map((seat) => seat.holder);
    expect(holders('adobe-cc-teams').sort()).toEqual(['NV-BOD4', 'NV-BOD5', 'NV-BOD6', 'NV-DEP']);
    expect(holders('zoom-pro').sort()).toEqual(['NV-BOD1', 'NV-BOD4', 'NV-SAL3', 'NV-SAL4']);
    expect(holders('zoom-business')).toEqual(['NV-DEP']);
    expect(holders('hubspot-starter').sort()).toEqual(['NV-SAL3', 'NV-SAL4', 'NV-SALH']);
    expect(holders('m365-basic')).toHaveLength(13);
    expect(
      F.seats.filter(
        (seat) =>
          person(seat.holder).department === 'MKT' &&
          !['jira', 'figma', 'slack', 'github', 'onepassword', 'postman', 'mailchimp', 'canva', 'grammarly'].includes(
            seat.subscription,
          ),
      ),
    ).toEqual([]);
  });

  it('keeps next-year stage reasons, unsubmitted head flag, cycle day offsets, and separate bootstrap admin in README', () => {
    expect(F.nextYear.find((n) => n.stage === 'VERSION_RETURNED')?.reason).toBeTruthy();
    expect(F.nextYear.filter((n) => !n.afterNext).every((n) => n.stage !== 'PROPOSAL_SUBMITTED')).toBe(true);
    const heads = F.departments.filter((d) => d.costCenter !== null && d.head !== null).map((d) => d.code);
    expect(heads.filter((code) => !F.nextYear.some((n) => n.department === code)).length).toBeGreaterThan(0);
    expect([F.cycle.submissionOffsetDays, F.nextCycle.submissionOffsetDays]).toEqual([0, 0]);
    expect(F.afterNextCycle.submissionOffsetDays).toBeGreaterThan(0);
    for (const cycle of [F.cycle, F.nextCycle, F.afterNextCycle]) {
      expect(cycle.decisionOffsetDays).toBeGreaterThanOrEqual(cycle.submissionOffsetDays);
    }
    const readme = readFileSync(join(__dirname, 'shared-demo-v4/README.md'), 'utf8');
    expect(readme).toContain(INSTALLATION.loginEmail);
    expect(F.people.some((p) => `${p.email}@${F.emailDomain}` === INSTALLATION.loginEmail)).toBe(false);
  });
});
