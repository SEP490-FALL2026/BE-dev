import { SuperAdminEventRefusedError } from '../../modules/personnel/public/super-admin-event.errors';
import { refusalLine } from './record-super-admin-event.command';

describe('what ops:record-super-admin-event prints when it refuses', () => {
  it('prints the code and the reason of a refused successor', () => {
    expect(
      refusalLine(
        new SuperAdminEventRefusedError('DEPARTMENT_TRANSFER.SUCCESSOR_NOT_A_MEMBER_ON_DATE', 'MANAGER_ROLE_REQUIRED'),
      ),
    ).toBe('Refused (DEPARTMENT_TRANSFER.SUCCESSOR_NOT_A_MEMBER_ON_DATE: MANAGER_ROLE_REQUIRED). Nothing was changed.');
    expect(
      refusalLine(
        new SuperAdminEventRefusedError(
          'OFFBOARDING_CASE.SUCCESSOR_NOT_A_MEMBER_ON_DATE',
          'SPENDING_APPROVER_CANNOT_HEAD',
        ),
      ),
    ).toBe(
      'Refused (OFFBOARDING_CASE.SUCCESSOR_NOT_A_MEMBER_ON_DATE: SPENDING_APPROVER_CANNOT_HEAD). Nothing was changed.',
    );
  });

  it('prints a refusal that has no reason as before', () => {
    expect(refusalLine(new SuperAdminEventRefusedError('DEPARTMENT_TRANSFER.NO_CHANGE'))).toBe(
      'Refused (DEPARTMENT_TRANSFER.NO_CHANGE). Nothing was changed.',
    );
  });
});
