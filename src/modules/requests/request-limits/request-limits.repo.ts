import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { NOT_OPEN_FOR_LEAVER } from '../access-request/access-request.types';
import { OPEN_LINE_STATES } from '../access-request/group-request.types';
import type { OpenNewRequest } from './request-limits.policy';

/**
 * What the limits of a request read and lock (`BR-MF1-01`): a lock of each beneficiary for the time of the transaction, so two
 * sendings for one person are judged one after the other, and the requests for new access each person has open. A read: the
 * writer of requests is `AccessRequestRepo`.
 */
@Injectable()
export class RequestLimitsRepo {
  /**
   * Takes the transaction lock of each person, in the order of their ids, so two requests naming the same people in another order
   * never wait for each other. Taken after the lock of the sender and before the lock of a department.
   */
  async lockBeneficiaries(tx: DbTx, employeeIds: readonly string[]): Promise<void> {
    for (const employeeId of [...new Set(employeeIds)].sort()) {
      const key = `requests.limits:${employeeId}`;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
    }
  }

  /**
   * The requests for new access each of these people has open, oldest first (`QĐ-104b`): sent (not a draft) and not at an end (a
   * request withdrawn that waits for the IT Admin to close its task counts as ended); a request of one person (`GRANT`, a proposal
   * of new software included) or the line of the person in a request for a group that has not ended. A request for a renewal, for a
   * service account, or one that is exempt is not counted. One statement; the people with none are absent.
   */
  async openNewRequestsOf(tx: DbTx, employeeIds: readonly string[]): Promise<Map<string, OpenNewRequest[]>> {
    if (employeeIds.length === 0) return new Map();
    const ended = [...NOT_OPEN_FOR_LEAVER];
    const openLines = [...OPEN_LINE_STATES];
    const rows = await tx.$queryRaw<{ employee_id: string; request_id: string; plan_id: string | null }[]>`
      SELECT b.employee_id, r.id AS request_id, r.plan_id
        FROM access_request_beneficiaries b
        JOIN access_requests r ON r.id = b.request_id
        LEFT JOIN access_request_lines l ON l.request_id = b.request_id AND l.employee_id = b.employee_id
       WHERE b.employee_id = ANY(${[...employeeIds]}::uuid[])
         AND r.state <> 'DRAFT'
         AND (
           (r.type = 'GRANT' AND r.limit_exemption IS NULL AND NOT (r.state::text = ANY(${ended}::text[])))
           OR (r.type = 'GROUP_GRANT' AND l.limit_exemption IS NULL AND l.state::text = ANY(${openLines}::text[]))
         )
       ORDER BY b.employee_id, r.submitted_at, r.id`;
    const found = new Map<string, OpenNewRequest[]>();
    for (const row of rows) {
      const open = found.get(row.employee_id) ?? [];
      open.push({ requestId: row.request_id, planId: row.plan_id });
      found.set(row.employee_id, open);
    }

    return found;
  }
}
