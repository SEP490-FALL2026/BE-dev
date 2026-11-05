import { allowedToolsOn, changeOf, isSameList, judgeApplication } from './allowlist.policy';

const zone = 'Asia/Ho_Chi_Minh';
// 2026-11-05 10:00 in Ho Chi Minh is 03:00 UTC.
const at = (iso: string) => new Date(iso);
const mapping = (tool: 'CODEX' | 'CLAUDE_CODE' | 'ANTIGRAVITY_CLI', applicationId: string) => ({ tool, applicationId });

describe('judgeApplication', () => {
  const ok = { kind: 'SAAS' as const, isCommunicationService: false, retiredAt: null };

  it('accepts bought software that is in use', () => {
    expect(judgeApplication(ok)).toBe('OK');
    expect(judgeApplication({ ...ok, kind: 'LICENSED' })).toBe('OK');
  });

  it('refuses what does not exist, what the company built, messaging services and retired software', () => {
    expect(judgeApplication(undefined)).toBe('NOT_FOUND');
    expect(judgeApplication({ ...ok, kind: 'INTERNAL' })).toBe('NOT_ELIGIBLE');
    expect(judgeApplication({ ...ok, isCommunicationService: true })).toBe('NOT_ELIGIBLE');
    expect(judgeApplication({ ...ok, retiredAt: new Date() })).toBe('NOT_ELIGIBLE');
  });
});

describe('isSameList and changeOf', () => {
  const current = [mapping('CODEX', 'a'), mapping('CLAUDE_CODE', 'b')];

  it('sees the same tools for the same applications in any order as no change', () => {
    expect(isSameList(current, [mapping('CLAUDE_CODE', 'b'), mapping('CODEX', 'a')])).toBe(true);
  });

  it('sees another application, a tool more or a tool less as a change, and says which tools', () => {
    expect(isSameList(current, [mapping('CODEX', 'c'), mapping('CLAUDE_CODE', 'b')])).toBe(false);
    expect(isSameList(current, [...current, mapping('ANTIGRAVITY_CLI', 'd')])).toBe(false);
    expect(isSameList(current, [mapping('CODEX', 'a')])).toBe(false);
    expect(changeOf(current, [mapping('CODEX', 'a'), mapping('ANTIGRAVITY_CLI', 'd')])).toEqual({
      added: ['ANTIGRAVITY_CLI'],
      removed: ['CLAUDE_CODE'],
    });
  });
});

describe('allowedToolsOn', () => {
  const v1 = {
    publishedAt: at('2026-11-01T03:00:00.000Z'),
    entries: [mapping('CODEX', 'a'), mapping('CLAUDE_CODE', 'b')],
  };
  const v2 = { publishedAt: at('2026-11-05T03:00:00.000Z'), entries: [mapping('CODEX', 'a')] };

  it('allows nothing before the first version and when there is none', () => {
    expect(allowedToolsOn([v1], '2026-10-30', zone).size).toBe(0);
    expect(allowedToolsOn([], '2026-11-05', zone).size).toBe(0);
  });

  it('allows a tool for the whole day it was removed on, and not from the next day', () => {
    expect([...allowedToolsOn([v1, v2], '2026-11-05', zone).keys()].sort()).toEqual(['CLAUDE_CODE', 'CODEX']);
    expect([...allowedToolsOn([v1, v2], '2026-11-06', zone).keys()]).toEqual(['CODEX']);
    expect([...allowedToolsOn([v1, v2], '2026-11-04', zone).keys()].sort()).toEqual(['CLAUDE_CODE', 'CODEX']);
  });

  it('judges the day in the time zone of the organization, across midnight', () => {
    const lateEvening = { publishedAt: at('2026-11-05T17:30:00.000Z'), entries: [mapping('CODEX', 'a')] };

    expect(allowedToolsOn([lateEvening], '2026-11-05', zone).size).toBe(0);
    expect(allowedToolsOn([lateEvening], '2026-11-06', zone).size).toBe(1);
  });

  it('takes the application of the latest version that was in force on the day', () => {
    const moved = { publishedAt: at('2026-11-05T03:00:00.000Z'), entries: [mapping('CODEX', 'z')] };

    expect(allowedToolsOn([v1, moved], '2026-11-05', zone).get('CODEX')).toBe('z');
    expect(allowedToolsOn([v1, moved], '2026-11-04', zone).get('CODEX')).toBe('a');
  });
});
