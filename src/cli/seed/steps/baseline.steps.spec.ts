import type { DemoRunContext } from '../demo-run.types';
import { SHARED_DEMO_V4 } from '../fixture/shared-demo-v4';
import { lineOf } from './baseline.steps';

/**
 * The seat file is read by the seat baseline import, which takes personal seats only (`QĐ-110m`): a service account is refused with
 * `SERVICE_ACCOUNT_NOT_SUPPORTED` and a machine account is flagged after the seat is granted, never written by the import.
 */
describe('the lines of the baseline seat file', () => {
  const ctx = { fixture: SHARED_DEMO_V4, today: '2026-11-10' } as unknown as DemoRunContext;

  it('writes every seat of the dataset as a personal seat of a declared person, the only kind the import accepts', () => {
    const people = SHARED_DEMO_V4.people.map((person) => person.code);

    for (const seat of SHARED_DEMO_V4.seats) {
      const [employeeCode, accountIdentifier, kind] = lineOf(ctx, seat).split(',');

      expect(people).toContain(employeeCode);
      expect(accountIdentifier).toMatch(/^[^@\s]+@[^@\s]+$/);
      expect(kind).toBe('personal');
    }
  });
});
