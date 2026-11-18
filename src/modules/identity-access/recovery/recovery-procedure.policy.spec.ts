import { RecoveryRefusedError } from '../public/recovery.errors';
import { RecoveryContext } from '../public/recovery.types';
import { assertSeparation } from './recovery-procedure.policy';

const shared: RecoveryContext = {
  ticketRef: 'R-2026-014',
  approverRef: 'cto@acme.vn',
  operatorRef: 'ops-1',
  environment: 'SHARED',
};

const problemOf = (run: () => void): string | null => {
  try {
    run();
  } catch (error) {
    if (error instanceof RecoveryRefusedError) return error.problem;
    throw error;
  }

  return null;
};

describe('who runs a recovery (US-01-09 AC-13)', () => {
  it('refuses an approver who is the operator, and an operator who is the recipient, in a shared environment', () => {
    expect(problemOf(() => assertSeparation({ ...shared, approverRef: ' OPS-1 ' }, []))).toBe('APPROVER_IS_OPERATOR');
    expect(problemOf(() => assertSeparation(shared, ['Ops-1']))).toBe('RECIPIENT_IS_OPERATOR');
  });

  it('refuses an approver who is the holder of a planned transfer, whatever the case or spacing', () => {
    expect(
      problemOf(() => assertSeparation({ ...shared, approverRef: ' Old.Admin@acme.vn ' }, [], 'old.admin@acme.vn')),
    ).toBe('APPROVER_IS_HOLDER');
  });

  it('accepts two other people, and a transfer that names no holder', () => {
    expect(problemOf(() => assertSeparation(shared, ['new@acme.vn'], 'old.admin@acme.vn'))).toBeNull();
    expect(problemOf(() => assertSeparation(shared, ['new@acme.vn'], undefined))).toBeNull();
    expect(problemOf(() => assertSeparation(shared, ['new@acme.vn']))).toBeNull();
  });

  it('lets one person do everything in a local test environment', () => {
    const local: RecoveryContext = { ...shared, approverRef: 'dev', operatorRef: 'dev', environment: 'LOCAL_TEST' };

    expect(problemOf(() => assertSeparation(local, ['dev'], 'dev'))).toBeNull();
  });
});
