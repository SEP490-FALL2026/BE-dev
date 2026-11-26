import { SHARED_DEMO_V4 as F } from './shared-demo-v4';

const person = (code: string) => F.people.find((candidate) => candidate.code === code)!;
const plan = (key: string) => F.applications.flatMap((app) => app.plans).find((candidate) => candidate.key === key)!;
const department = (code: string) => F.departments.find((candidate) => candidate.code === code)!;
const source = (key: string) => F.usageSources.find((s) => s.key === key)!;
const emailOf = (code: string) => `${person(code).email}@${F.emailDomain}`;
const inactiveDays = (code: string) => {
  const figma = source('figma');

  return figma.rows.find((r) => r.identifier === emailOf(code))!.lastActivityDaysAgo! - figma.windowToDaysAgo;
};

describe('shared dataset v4: restored MF-5 usage & MF-2/MF-3 IT admin coverage (G-14 / e53d7ac0~1)', () => {
  it('reaches exact 30/60/90 inactive tiers, plus alias and missing Jira row cases', () => {
    expect(inactiveDays('NV-DES1')).toBe(79);
    expect(inactiveDays('NV-DES1')).toBeGreaterThanOrEqual(60);
    expect(inactiveDays('NV-DES1')).toBeLessThan(90);
    expect(inactiveDays('NV-DES4')).toBeGreaterThanOrEqual(30);
    expect(inactiveDays('NV-DES4')).toBeLessThan(60);
    expect(inactiveDays('NV-DES10')).toBeGreaterThanOrEqual(90);
    expect(source('figma').rows.some((r) => r.identifier.startsWith('manh.ngo+figma'))).toBe(true);
    expect(source('jira').rows.some((r) => r.identifier === emailOf('NV-DES3'))).toBe(false);
    expect(F.seats.some((s) => s.subscription === 'jira' && s.holder === 'NV-DES3')).toBe(true);
  });

  it('builds MF-5 usage traps, 90-day grants, DES ghost decisions, and non-head personnel events', () => {
    const grantedAgo = (code: string) =>
      F.seats.find((s) => s.subscription === 'figma' && s.holder === code)!.grantedDaysAgo ?? 130;
    expect(grantedAgo('NV-DES6')).toBeLessThan(14);
    expect(grantedAgo('NV-DES9')).toBeLessThan(60);
    expect(F.seats.find((s) => s.subscription === 'figma' && s.holder === 'NV-DES10')?.endInDays).toBeLessThan(31);
    expect(source('figma').rows.some((r) => r.identifier === 'vo.thi.old@saoviet-old.example')).toBe(true);
    expect(source('figma').rows.some((r) => r.identifier === emailOf('NV-DES8'))).toBe(false);
    for (const code of ['NV-DES1', 'NV-DES2', 'NV-DES3', 'NV-DESH', 'NV-DES4', 'NV-DES11', 'NV-OFF1']) {
      const seat = F.seats.find((s) => s.subscription === 'figma' && s.holder === code);
      expect(seat?.grantedDaysAgo ?? 130).toBeGreaterThanOrEqual(90);
    }
    expect(F.ghostDecisions.some((d) => d.holder === 'NV-DESH')).toBe(true);
    for (const d of F.ghostDecisions) expect(person(d.holder).department).toBe('DES');
    const heads = new Set(F.departments.flatMap((d) => (d.head ? [d.head] : [])));
    for (const event of F.personnel.filter((e) => e.kind !== 'LONG_LEAVE')) {
      expect(heads.has(event.employee)).toBe(false);
    }
  });

  it('checks MF-2/MF-3 leaving IT admin, transfer employee, and workspace profile gaps', () => {
    type OffboardingEvent = Extract<(typeof F.personnel)[number], { kind: 'OFFBOARDING' }>;
    const offboarding = (employee: string): OffboardingEvent =>
      F.personnel.find((e): e is OffboardingEvent => e.kind === 'OFFBOARDING' && e.employee === employee)!;
    expect(offboarding('NV-ITA4').lastDayInWorkingDays).toBeGreaterThan(0);
    expect(person('NV-ITA4').account).toBe('IT_ADMIN');
    expect(plan('mailchimp-standard').vendorAdmin).toBe('NV-ITA3');
    expect(F.departments.some((d) => d.itAdmin === 'NV-ITA4')).toBe(false);
    expect(offboarding('NV-OFF1').lastDayInWorkingDays).toBeUndefined();
    expect(F.seats.some((s) => s.subscription === 'chatgpt' || s.subscription === 'cursor')).toBe(false);

    const transfer = F.personnel.find((e) => e.kind === 'TRANSFER')!;
    expect(person('NV-DEV4').account).not.toBeNull();
    expect(F.seats.filter((s) => s.holder === 'NV-DEV4').length).toBeGreaterThan(0);
    expect(transfer.employee).not.toBe('NV-CTR1');

    expect(plan('jetbrains-all')).toMatchObject({ provisioningType: 'K4', hasAdminConsole: true });
    expect(plan('jetbrains-datagrip').hasAdminConsole).toBeUndefined();
    const flagged = F.applications.flatMap((a) => a.plans).filter((p) => p.withoutOwnerAccountEmail);
    expect(flagged.map((p) => [p.key, p.provisioningType]).sort()).toEqual([
      ['canva-teams', 'K2'],
      ['notion-business', 'K2'],
    ]);
  });

  it('lists department software, pending/rejected proposals, and headless K5 completion (P16–P18, QĐ-111bc)', () => {
    const apps = new Set(F.applications.map((a) => a.key));
    for (const list of F.departmentSoftware) {
      expect(department(list.department).itAdmin).not.toBeNull();
      for (const item of list.items) {
        expect(apps.has(item.application)).toBe(true);
        if (item.plan) {
          expect(F.applications.find((a) => a.key === item.application)!.plans.map((p) => p.key)).toContain(item.plan);
        }
      }
    }
    expect(F.softwareProposals.map((p) => p.outcome).sort()).toEqual(['PENDING', 'REJECTED']);
    for (const proposal of F.softwareProposals) {
      expect(department(proposal.department).head).not.toBeNull();
      const listed = F.departmentSoftware.find((l) => l.department === proposal.department)?.items ?? [];
      expect(listed.some((i) => i.application === proposal.application && i.plan === proposal.plan)).toBe(false);
      if (proposal.outcome === 'REJECTED') expect(proposal.rejectionReason).toBeTruthy();
    }
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
