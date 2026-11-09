import {
  AssignmentNotOpenError,
  ProvisioningEvidenceRequiredError,
  ProvisioningTaskNotBeforeError,
  RevocationCompletionError,
  RevocationRefusedError,
} from '../public/licensing.errors';
import { assertNotBefore, planCompletion, planKeyReturn, type CompletionInput } from './revocation.policy';

const TODAY = '2026-10-24';
const STARTED = '2026-01-05';
const context = (type: 'K1' | 'K2' | 'K3' | 'K4' | 'K5', startsOn = STARTED) => ({ type, startsOn, today: TODAY });
const problemOf = (run: () => unknown): string | null => {
  try {
    run();

    return null;
  } catch (error) {
    if (error instanceof RevocationCompletionError) return error.problem;
    if (error instanceof RevocationRefusedError) return error.problem;
    if (error instanceof ProvisioningEvidenceRequiredError) return 'EVIDENCE_REQUIRED';
    if (error instanceof AssignmentNotOpenError) return 'NOT_OPEN';
    throw error;
  }
};

describe('US-10-07 AC-18: a revocation is not done before its day not before', () => {
  it('refuses the days before it with the day it can be done, and lets that day and the later ones, and a task with none', () => {
    expect(() => assertNotBefore('2026-11-08', '2026-11-05')).toThrow(ProvisioningTaskNotBeforeError);
    expect(() => assertNotBefore('2026-11-08', '2026-11-07')).toThrow(new ProvisioningTaskNotBeforeError('2026-11-08'));
    expect(() => assertNotBefore('2026-11-08', '2026-11-08')).not.toThrow();
    expect(() => assertNotBefore('2026-11-08', '2026-11-30')).not.toThrow();
    expect(() => assertNotBefore(null, '2026-11-01')).not.toThrow();
  });
});

describe('BR-MF1-09: a K4 seat is revoked and its key goes back to the store (US-07-05 AC-6, AC-7, QĐ-103d, Q-10 B)', () => {
  const k4 = (extra: Partial<CompletionInput> = {}): CompletionInput => ({
    completion: 'KEY_DEACTIVATED',
    evidence: 'Deactivated on the laptop',
    ...extra,
  });

  it('ends the seat today with the evidence, like K2 and K5', () => {
    expect(planCompletion(k4(), context('K4'))).toMatchObject({
      completion: 'KEY_DEACTIVATED',
      evidence: 'Deactivated on the laptop',
      endOn: TODAY,
    });
  });

  it('refuses a completion with no evidence', () => {
    expect(() => planCompletion(k4({ evidence: '  ' }), context('K4'))).toThrow(ProvisioningEvidenceRequiredError);
  });

  it('puts the key back in the store when nothing else is said', () => {
    expect(planKeyReturn(k4(), 'K4')).toEqual({ disposition: 'RETURN_TO_STORE', withdrawalReason: null });
    expect(planKeyReturn(k4({ keyDisposition: 'RETURN_TO_STORE' }), 'K4')).toEqual({
      disposition: 'RETURN_TO_STORE',
      withdrawalReason: null,
    });
  });

  it('withdraws the key from the store at once with a reason, trimmed', () => {
    expect(planKeyReturn(k4({ keyDisposition: 'WITHDRAW', withdrawalReason: '  No transfer clause  ' }), 'K4')).toEqual(
      {
        disposition: 'WITHDRAW',
        withdrawalReason: 'No transfer clause',
      },
    );
  });

  it('refuses a withdrawal with no reason, and a reason with no withdrawal', () => {
    expect(problemOf(() => planKeyReturn(k4({ keyDisposition: 'WITHDRAW' }), 'K4'))).toBe('WITHDRAWAL_REASON_REQUIRED');
    expect(problemOf(() => planKeyReturn(k4({ keyDisposition: 'WITHDRAW', withdrawalReason: ' ' }), 'K4'))).toBe(
      'WITHDRAWAL_REASON_REQUIRED',
    );
    expect(problemOf(() => planKeyReturn(k4({ withdrawalReason: 'why' }), 'K4'))).toBe('COMPLETION_NOT_ALLOWED');
  });

  it.each(['K1', 'K2', 'K5'] as const)('has no key for %s and refuses the fields of one', (type) => {
    expect(planKeyReturn({ completion: 'ACCOUNT_REMOVED', evidence: 'x' }, type)).toBeNull();
    expect(
      problemOf(() =>
        planKeyReturn({ completion: 'ACCOUNT_REMOVED', evidence: 'x', keyDisposition: 'WITHDRAW' }, type),
      ),
    ).toBe('COMPLETION_NOT_ALLOWED');
    expect(
      problemOf(() => planKeyReturn({ completion: 'ACCOUNT_REMOVED', evidence: 'x', withdrawalReason: 'why' }, type)),
    ).toBe('COMPLETION_NOT_ALLOWED');
  });
});
