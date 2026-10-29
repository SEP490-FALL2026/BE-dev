import { ApiException } from '../../../infrastructure/http/errors/api.exception';
import { EmployeeEmailTakenError, EmployeeOpenSeatNeedsEndError } from '../../organization/public/organization.errors';
import { LeaveRefusedError } from '../leave/leave.errors';
import { NoticeRefusedError } from '../notice/notice.errors';
import { OffboardingRefusedError } from '../offboarding/offboarding.errors';
import { PersonnelAccessRefusedError } from '../public/personnel.errors';
import { TransferRefusedError } from '../transfer/transfer.errors';
import { SuperAdminEventRefusedError } from '../public/super-admin-event.errors';

/**
 * What a refusal of an event is called by the command: the command's own refusal as it is, the actor the policy refused as the person
 * who is not a Super Admin, and the business refusal of the event with the code it has on the wire (for example
 * `DEPARTMENT_TRANSFER.NO_CHANGE`), so the operator reads the same word as the application would answer. A refusal that arrives as the
 * answer of a notice recorder is already that answer. Null for anything else, which is not a refusal but a failure.
 */
export function refusalOf(error: unknown): SuperAdminEventRefusedError | null {
  if (error instanceof SuperAdminEventRefusedError) return error;
  if (error instanceof PersonnelAccessRefusedError) return new SuperAdminEventRefusedError('SUBJECT_NOT_SUPER_ADMIN');
  if (error instanceof TransferRefusedError)
    return new SuperAdminEventRefusedError(`DEPARTMENT_TRANSFER.${error.code}`);
  if (error instanceof LeaveRefusedError) return new SuperAdminEventRefusedError(`LONG_LEAVE.${error.code}`);
  if (error instanceof OffboardingRefusedError)
    return new SuperAdminEventRefusedError(`OFFBOARDING_CASE.${error.code}`);
  if (error instanceof NoticeRefusedError) return new SuperAdminEventRefusedError(`PERSONNEL_NOTICE.${error.code}`);
  // A race the database refused after the check of the correction of the record: the same words as the check.
  if (error instanceof EmployeeEmailTakenError) return new SuperAdminEventRefusedError('PROFILE.WORK_EMAIL_TAKEN');
  if (error instanceof EmployeeOpenSeatNeedsEndError) {
    return new SuperAdminEventRefusedError('PROFILE.OPEN_ASSIGNMENT_NEEDS_EXPECTED_END');
  }
  if (error instanceof ApiException) {
    const code = (error.getResponse() as { code?: unknown }).code;

    return typeof code === 'string' ? new SuperAdminEventRefusedError(code) : null;
  }

  return null;
}
