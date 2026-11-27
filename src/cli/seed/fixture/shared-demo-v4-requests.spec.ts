import { dayOffset, endOfMonth } from '../demo-dates';
import { SHARED_DEMO_V4 as F } from './shared-demo-v4';

const person = (code: string) => F.people.find((candidate) => candidate.code === code)!;
const plan = (key: string) => F.applications.flatMap((app) => app.plans).find((candidate) => candidate.key === key)!;
const department = (code: string) => F.departments.find((candidate) => candidate.code === code)!;
const req = (key: string) => F.requests.find((r) => r.key === key)!;
const extra = F.requests.filter((r) => /^R(4\d|5[0-8])$/.test(r.key));

describe('shared dataset v4: restored MF-1 request coverage (G-14 / e53d7ac0~1)', () => {
  it('covers head/headless senders, group requests, proposals, and K1/K4/K5 plan types', () => {
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
    const contractor = person('NV-CTR1');
    expect(contractor.employmentType).toBe('CONTRACTOR');
    expect(contractor.contractEndInDays).toBe(20);
    expect(contractor.contractEndInDays).toBeLessThanOrEqual(30);
    expect(F.requests.find((r) => r.requester === 'NV-CTR1')?.termMonths).toBeGreaterThanOrEqual(1);
    expect(req('R17').termMonths).toBe(2);
  });

  it('checks termMonths caps across K1/K4/all requests and demo-date utilities', () => {
    for (const request of [...F.requests, { ...F.draft, key: 'draft' }]) {
      const declared = request.plan ? plan(request.plan) : null;
      if (declared?.provisioningType === 'K1') {
        expect(request.termMonths).toBeGreaterThanOrEqual(1);
        expect(request.termMonths).toBeLessThanOrEqual(declared.referenceCommitmentMonths === 12 ? 12 : 9);
      }
      if (typeof request.termMonths === 'number') {
        expect(request.termMonths).toBeGreaterThanOrEqual(1);
        expect(request.termMonths).toBeLessThanOrEqual(12);
      }
    }
    expect(dayOffset('2026-11-10', 20)).toBe('2026-11-30');
    expect(endOfMonth('2026-02-10')).toBe('2026-02-28');
  });

  it('keeps head/line rejections, return steps (NEED/ASSESSMENT/SPEND), IT_REJECTED, and FAILED (no AWAITING_IT_CLOSE)', () => {
    expect(department('FIN').head).toBe(req('R42').requester);
    expect(department('BOD').head).toBe(req('R49').requester);
    expect(req('R49').rejectedLines).toEqual(['NV-BOD2']);
    for (const code of req('R49').rejectedLines ?? []) expect(req('R49').beneficiaries).toContain(code);
    expect(req('R49').target).toBe('AWAITING_EXECUTION');

    const at = (target: string, fields: Record<string, unknown> = {}) =>
      extra.some((r) => r.target === target && Object.entries(fields).every(([k, v]) => (r as never)[k] === v));
    for (const target of ['IT_REJECTED', 'EXECUTING', 'FAILED', 'PENDING_OR_CANCELLED']) expect(at(target)).toBe(true);
    expect(at('REJECTED', { rejectAt: 'SPEND' })).toBe(true);
    for (const returnAt of ['NEED', 'ASSESSMENT', 'SPEND']) {
      expect(at('AWAITING_REQUESTER_REVISION', { returnAt })).toBe(true);
    }
    expect(F.requests.some((r) => (r.target as string) === 'AWAITING_IT_CLOSE')).toBe(false);
  });

  it('keeps withdrawal/send-back/reserve/blocked-sender rules, request ordering, proposals, and pending queues', () => {
    expect(F.departments.map((d) => d.head)).not.toContain(req('R05').requester);
    expect(F.departments.map((d) => d.head)).not.toContain(req('R60').requester);
    for (const r of extra.filter((candidate) => candidate.returnAt === 'SPEND')) {
      expect(F.departments.map((d) => d.head)).toContain(r.requester);
    }
    expect(extra.filter((r) => r.confirmReserve).every((r) => person(r.requester).department === 'FIN')).toBe(true);
    expect(req('R57').readAs).toBe(department(person(req('R57').requester).department!).head);
    expect(extra.filter((r) => r.readAs).map((r) => r.key)).toEqual(['R57']);

    const order = F.requests.map((r) => r.key);
    expect(order.indexOf('R50')).toBeLessThan(order.indexOf('R47'));
    expect(order.indexOf('R56')).toBeLessThan(order.indexOf('R47'));
    expect(order.indexOf('R47')).toBeLessThan(order.indexOf('R49'));
    expect(order.indexOf('R48')).toBeLessThan(order.indexOf('R54'));

    expect(req('R43').proposal).toMatchObject({ softwareName: 'Linear', homepageUrl: 'https://linear.app' });
    expect(req('R44').proposal).toMatchObject({ softwareName: 'Loom', homepageUrl: 'https://www.loom.com' });
    expect(plan(req('R43').alternativePlan!)).toBeDefined();
    expect(plan(req('R50').plan!).provisioningType).toBe('K5');

    const queues = new Set(extra.filter((r) => r.target === 'PENDING').map((r) => person(r.requester).department));
    expect([...queues].sort()).toEqual(['BOD', 'FIN', 'OPS']);
  });
});
