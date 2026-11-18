import type { AiToolKey } from '../allowlist/allowlist.policy';
import { evaluateSnapshots, type SnapshotInput } from './tool-status.policy';

const acceptFromAt = new Date('2026-11-03T03:00:00.000Z');
const now = new Date('2026-11-06T02:00:00.000Z');
const allowed = new Map<AiToolKey, string>([
  ['CODEX', 'app'],
  ['CLAUDE_CODE', 'app2'],
]);

const snapshot = (over: Partial<SnapshotInput> = {}): SnapshotInput => ({
  tool: 'CODEX',
  observedAt: new Date('2026-11-05T02:00:00.000Z'),
  auth: { status: 'LOGGED_IN' },
  quota: { status: 'OK', windows: [{ code: 'PRIMARY', usedPercent: 40, resetsAt: null }] },
  ...over,
});

const judge = (snapshots: SnapshotInput[], over = {}) =>
  evaluateSnapshots({
    snapshots,
    now,
    acceptFromAt,
    acceptUntilAt: null,
    timeZone: 'Asia/Ho_Chi_Minh',
    allowedOn: () => allowed,
    ...over,
  });

describe('evaluateSnapshots', () => {
  it('keeps a snapshot inside the window whose quota agrees with itself', () => {
    expect(judge([snapshot(), snapshot({ tool: 'CODEX', quota: { status: 'NOT_SUPPORTED', windows: [] } })])).toEqual([
      null,
      null,
    ]);
  });

  it('refuses a clock ahead of the server, an instant outside the window and a tool off the allowlist, in that order', () => {
    expect(judge([snapshot({ observedAt: new Date('2026-11-06T02:10:00.000Z') })])).toEqual(['FUTURE_OBSERVED_AT']);
    expect(judge([snapshot({ observedAt: new Date('2026-11-03T02:59:00.000Z') })])).toEqual(['OUTSIDE_WINDOW']);
    expect(judge([snapshot()], { acceptUntilAt: new Date('2026-11-04T00:00:00.000Z') })).toEqual(['OUTSIDE_WINDOW']);
    expect(judge([snapshot({ tool: 'ANTIGRAVITY_CLI', quota: { status: 'NOT_SUPPORTED', windows: [] } })])).toEqual([
      'NOT_IN_ALLOWLIST',
    ]);
    expect(judge([snapshot()], { acceptFromAt: null })).toEqual(['OUTSIDE_WINDOW']);
  });

  it('refuses a quota that contradicts itself: OK with no window, a window with another status, a repeated or foreign code', () => {
    const w = (code: 'PRIMARY' | 'SECONDARY' | 'SESSION') => ({ code, usedPercent: 10, resetsAt: null });

    expect(judge([snapshot({ quota: { status: 'OK', windows: [] } })])).toEqual(['INVALID_QUOTA']);
    expect(judge([snapshot({ quota: { status: 'FAILED', windows: [w('PRIMARY')] } })])).toEqual(['INVALID_QUOTA']);
    expect(judge([snapshot({ quota: { status: 'OK', windows: [w('PRIMARY'), w('PRIMARY')] } })])).toEqual([
      'INVALID_QUOTA',
    ]);
    expect(judge([snapshot({ quota: { status: 'OK', windows: [w('SESSION')] } })])).toEqual(['INVALID_QUOTA']);
    expect(judge([snapshot({ tool: 'CLAUDE_CODE', quota: { status: 'OK', windows: [w('SESSION')] } })])).toEqual([
      null,
    ]);
  });
});
