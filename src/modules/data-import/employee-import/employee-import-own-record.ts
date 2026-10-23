import { InvalidEmailError, normalizeEmail } from '../../../core/email';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { OrganizationService } from '../../organization/organization.service';

/** The record of the person importing: a row that names it is refused, however it compares (`US-02-02` AC-18). */
export type OwnRecord = { employeeCode: string; normalizedEmail: string | null } | null;

export async function readOwnRecord(
  organization: OrganizationService,
  employeeId: string,
  tx?: DbTx,
): Promise<OwnRecord> {
  const own = await organization.getEmployee(employeeId, tx);
  if (!own) return null;
  let normalizedEmail: string | null = null;
  if (own.workEmail) {
    try {
      normalizedEmail = normalizeEmail(own.workEmail);
    } catch (error) {
      if (!(error instanceof InvalidEmailError)) throw error;
    }
  }

  return { employeeCode: own.employeeCode, normalizedEmail };
}
