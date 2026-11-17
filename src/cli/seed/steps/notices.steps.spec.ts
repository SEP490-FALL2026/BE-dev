import type { DemoRunContext } from '../demo-run.types';
import { SHARED_DEMO_V4 as fixture } from '../fixture/shared-demo-v4';
import { demoSteps } from '../seed-steps';
import { linkingBody, recordingBody, rejectionBody, noticeMove, noticeBody } from './notices.steps';

const ctx = { fixture, today: '2026-11-18' } as unknown as DemoRunContext;
const spec = (key: string) => fixture.notices.find((notice) => notice.key === key)!;

describe('personnel notices', () => {
  it('keeps the pending notice and adds the link, rejection and recorded leave', () => {
    expect(fixture.notices.map(({ key, sender, employee, handling }) => [key, sender, employee, handling])).toEqual([
      ['NOTICE', 'NV-ENGH', 'NV-DEV3', undefined],
      ['NOTICE2', 'NV-DESH', 'NV-DES7', 'LINK'],
      ['NOTICE3', 'NV-DEP', 'NV-BOD5', 'REJECT'],
      ['NOTICE4', 'NV-ITOH', 'NV-ITO2', 'RECORD'],
    ]);
  });
  it('links to the real event, records verification, and tags a rejection', () => {
    const link = linkingBody(ctx, spec('NOTICE2'), 'leave-1');
    expect(link).toMatchObject({
      eventId: 'leave-1',
      verification: { method: 'DIRECT_CONTACT' },
    });
    expect(link.verification.reference).toContain('[SV-NOTICE2]');
    expect(rejectionBody(ctx, spec('NOTICE3')).reason).toContain('[SV-NOTICE3]');
  });
  it('records the leave and HR basis on today, with an approved return five days later', () => {
    expect(recordingBody(ctx, spec('NOTICE4'))).toMatchObject({
      grounds: { type: 'HR_DECISION', issuedOn: '2026-11-18' },
      event: { startedOn: '2026-11-18', approvedReturnOn: '2026-11-23' },
    });
    const notice = noticeBody(ctx, spec('NOTICE3'), 'e-1');
    expect(notice).toMatchObject({
      employeeId: 'e-1',
      kind: 'DEPARTURE',
      proposedOn: '2026-12-18',
    });
    expect(notice.note).toMatch(/^\[SV-NOTICE3\]/);
  });
  it('handles a pending notice once, accepts recorded or rejected targets, and detects changed decisions', () => {
    expect(noticeMove(spec('NOTICE'), 'PENDING_VERIFICATION')).toBe('PRESENT');
    expect(noticeMove(spec('NOTICE2'), 'PENDING_VERIFICATION')).toBe('HANDLE');
    expect(noticeMove(spec('NOTICE2'), 'RECORDED')).toBe('PRESENT');
    expect(noticeMove(spec('NOTICE3'), 'REJECTED')).toBe('PRESENT');
    expect(noticeMove(spec('NOTICE3'), 'RECORDED')).toBe('CONFLICT');
  });
  it('runs after the personnel events and both requests ITO2 must send before taking leave', () => {
    const keys = demoSteps(fixture).map(({ key }) => key);
    for (const key of ['personnel.events', 'requests.R48', 'requests.R54']) {
      expect(keys.indexOf('personnel.notices')).toBeGreaterThan(keys.indexOf(key));
    }
    expect(keys).not.toContain('personnel.notice');
  });
});
