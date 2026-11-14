import { HttpStatus } from '@nestjs/common';
import { ApiException } from '../../../infrastructure/http/errors/api.exception';
import { OffboardingRefusedError } from '../offboarding/offboarding.errors';
import { SuperAdminEventRefusedError } from '../public/super-admin-event.errors';
import { TransferRefusedError } from '../transfer/transfer.errors';
import { refusalOf } from './super-admin-event-refusal.mapper';

describe('refusalOf — what the operations command says of a refusal', () => {
  it('keeps the reason of a successor refusal of a transfer and of a departure, and nothing else of their details', () => {
    const transfer = refusalOf(
      new TransferRefusedError('SUCCESSOR_NOT_A_MEMBER_ON_DATE', {
        reason: 'MANAGER_ROLE_REQUIRED',
        employeeCode: 'E-007',
        loginEmail: 'someone@acme.vn',
      }),
    );
    const departure = refusalOf(
      new OffboardingRefusedError('SUCCESSOR_NOT_A_MEMBER_ON_DATE', { reason: 'SPENDING_APPROVER_CANNOT_HEAD' }),
    );

    expect(transfer).toMatchObject({
      problem: 'DEPARTMENT_TRANSFER.SUCCESSOR_NOT_A_MEMBER_ON_DATE',
      reason: 'MANAGER_ROLE_REQUIRED',
    });
    expect(departure).toMatchObject({
      problem: 'OFFBOARDING_CASE.SUCCESSOR_NOT_A_MEMBER_ON_DATE',
      reason: 'SPENDING_APPROVER_CANNOT_HEAD',
    });
    expect(Object.keys(transfer ?? {}).sort()).toEqual(['name', 'problem', 'reason']);
  });

  it('names a head who is moved without an employee to follow them with the word of a departure, PERSONNEL.SUCCESSOR_REQUIRED (QĐ-110h)', () => {
    expect(refusalOf(new TransferRefusedError('SUCCESSOR_REQUIRED', { departmentId: 'd-1' }))).toMatchObject({
      problem: 'PERSONNEL.SUCCESSOR_REQUIRED',
    });
    expect(refusalOf(new OffboardingRefusedError('SUCCESSOR_REQUIRED', { departmentId: 'd-1' }))).toMatchObject({
      problem: 'PERSONNEL.SUCCESSOR_REQUIRED',
    });
  });

  it('keeps the reason of the answer of a notice recorder, which arrives as an ApiException', () => {
    const answer = new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, {
      code: 'DEPARTMENT_TRANSFER.SUCCESSOR_NOT_A_MEMBER_ON_DATE',
      message: 'The person named cannot head the department on that day.',
      details: { reason: 'MANAGER_ROLE_REQUIRED', anything: 'else' },
    });

    expect(refusalOf(answer)).toMatchObject({
      problem: 'DEPARTMENT_TRANSFER.SUCCESSOR_NOT_A_MEMBER_ON_DATE',
      reason: 'MANAGER_ROLE_REQUIRED',
    });
  });

  it('copies a reason only when it is a word of the enumeration, never a name, an email or free text', () => {
    for (const reason of ['Nguyen Van A', 'a@b.vn', 'lower_case', 'WITH SPACE', '', 7, null, { code: 'X' }]) {
      expect(
        refusalOf(new TransferRefusedError('SUCCESSOR_NOT_A_MEMBER_ON_DATE', { reason: reason as string }))?.reason,
      ).toBeUndefined();
    }
  });

  it('gives no reason to a refusal that has none, so the command prints it as before', () => {
    expect(refusalOf(new TransferRefusedError('NO_CHANGE'))).toMatchObject({
      problem: 'DEPARTMENT_TRANSFER.NO_CHANGE',
    });
    expect(refusalOf(new TransferRefusedError('NO_CHANGE'))?.reason).toBeUndefined();
    expect(refusalOf(new SuperAdminEventRefusedError('RECORD_NOT_FOUND'))?.reason).toBeUndefined();
  });
});
