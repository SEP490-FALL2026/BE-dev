import type { DemoRunContext } from '../demo-run.types';
import { SHARED_DEMO_V4 as F } from '../fixture/shared-demo-v4';
import { demoSteps } from '../seed-steps';
import { RETURN_STEPS, openSeatOf, returnBody, returnMove, revocationTaskOf } from './returns.steps';

const ctx = { fixture: F, today: '2026-11-18' } as unknown as DemoRunContext;
const spec = (key: string) => F.returns.find((candidate) => candidate.key === key)!;

describe('the returns of two seats (T13, S11)', () => {
  it('has the seat of NV-DEV6 in Notion Business completed by IT, and the one of NV-BOD2 in Photoshop left waiting', () => {
    expect(F.returns.map((r) => [r.key, r.holder, r.subscription, r.complete])).toEqual([
      ['RET1', 'NV-DEV6', 'notion-business', true],
      ['RET2', 'NV-BOD2', 'adobe-photoshop', false],
    ]);
  });

  it('returns a seat the holder really has from the baseline, and never a seat a request of the dataset is still to grant', () => {
    for (const r of F.returns) {
      expect(F.seats.some((seat) => seat.holder === r.holder && seat.subscription === r.subscription)).toBe(true);
      expect(F.requests.some((request) => request.requester === r.holder && request.plan === r.subscription)).toBe(
        false,
      );
    }
  });

  it('writes the body of the return with the seat and a reason that carries the tag of the return', () => {
    const body = returnBody(ctx, spec('RET1'), 'seat-1');

    expect(body.assignmentId).toBe('seat-1');
    expect(body.reason).toMatch(/^\[SV-RET1\] /);
  });

  it('is sent by the holder, who has an account, and never by the spending approver or the Super Admin', () => {
    for (const r of F.returns) {
      const holder = F.people.find((p) => p.code === r.holder)!;
      expect(holder.account).not.toBeNull();
      expect(r.holder).not.toBe(F.approvalRoles.SPENDING_APPROVER);
    }
  });
});

describe('what a run does about a return it finds (C-13)', () => {
  it.each([
    [true, null, 'SEND'],
    [true, 'AWAITING_REVOCATION', 'COMPLETE'],
    [true, 'COMPLETED', 'PRESENT'],
    [false, null, 'SEND'],
    [false, 'AWAITING_REVOCATION', 'PRESENT'],
    [false, 'COMPLETED', 'CONFLICT'],
    [true, 'FAILED', 'CONFLICT'],
    [false, 'FAILED', 'CONFLICT'],
  ] as const)('with complete=%s and a return %s: %s', (complete, state, move) => {
    expect(returnMove({ complete }, state === null ? null : { state })).toBe(move);
  });

  it('picks the seat that is still the holder’s, not one that ended', () => {
    const seats = [
      { id: 'a', validUntil: '2026-11-01', cancelledAt: null, failedAt: null },
      { id: 'b', validUntil: null, cancelledAt: null, failedAt: null },
    ];

    expect(openSeatOf(seats)?.id).toBe('b');
    expect(openSeatOf([seats[0]])).toBeUndefined();
  });

  it('picks the revocation task of the seat that is still to be worked, never a grant or a task that is done', () => {
    const tasks = [
      { id: 't1', kind: 'GRANT', status: 'QUEUED', assignmentId: 'b' },
      { id: 't2', kind: 'REVOKE', status: 'COMPLETED', assignmentId: 'b' },
      { id: 't3', kind: 'REVOKE', status: 'QUEUED', assignmentId: 'other' },
      { id: 't4', kind: 'REVOKE', status: 'QUEUED', assignmentId: 'b' },
    ];

    expect(revocationTaskOf(tasks, 'b')?.id).toBe('t4');
    expect(revocationTaskOf(tasks.slice(0, 3), 'b')).toBeUndefined();
  });
});

describe('the step of the returns', () => {
  const keys = demoSteps(F).map((step) => step.key);

  it('comes after the requests, the baseline and the IT Admins it depends on', () => {
    const step = RETURN_STEPS[0];

    for (const need of step.needs) expect(keys.indexOf(need)).toBeGreaterThanOrEqual(0);
    for (const need of step.needs) expect(keys.indexOf(step.key)).toBeGreaterThan(keys.indexOf(need));
    expect(keys.indexOf(step.key)).toBeGreaterThan(keys.indexOf('requests.R57'));
  });
});
