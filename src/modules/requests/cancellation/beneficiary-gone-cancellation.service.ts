import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { BudgetsApi } from '../../budgets/public/budgets.api';
import { LicensingApi } from '../../licensing/public/licensing.api';
import type { SystemActor } from '../../licensing/public/licensing.types';
import { AccessRequestRepo } from '../access-request/access-request.repo';
import type { AccessRequestRecord } from '../access-request/access-request.types';
import type { LineRecord } from '../access-request/group-request.types';
import { RequestLineRepo } from '../group-request/request-line.repo';
import type {
  BeneficiaryGoneInput,
  BeneficiaryGonePreview,
  BeneficiaryGonePreviewItem,
  BeneficiaryGoneResult,
} from '../public/requests.types';
import { BeneficiaryGoneClosing } from './beneficiary-gone-closing.service';
import { BeneficiaryGoneItNotice } from './beneficiary-gone-it-notice.service';
import { goneCauseOf, verdictOf, type GoneVerdict } from './beneficiary-gone-scope.policy';

/**
 * The system closes the open requests of a person who is gone (`QĐ-110d`, `QĐ-110o`, M-12), in the transaction of the caller (the sweep
 * of the day access is blocked, the sweep of the day a transfer takes effect). Nobody is the actor: it is the system, and the request ends
 * with a cause of the system and no employee who closed it. The requests to look at are the open ones of the person, which the facade
 * `RequestsApi` lists (the group that knows what open means is not reached from here).
 *
 * Each of them that is in the scope (`beneficiary-gone-scope.policy.ts`) is judged under its lock, taken as the IT Admin who
 * works its grant takes them, the task of the grant first and then the request (and the line): where no grant task has begun the request
 * ends as cancelled and what was held for it goes back to the budget (`BeneficiaryGoneClosing`); where the grant is being carried out
 * nothing is cancelled and the IT Admin in charge is told in the inbox, to check the vendor and close it by hand. For a request for a
 * group it is the line of the person that ends, and the others carry on. The person has few open requests, so one transaction closes them
 * all; run again, it finds nothing left to close and tells the IT Admin nothing twice.
 */
@Injectable()
export class BeneficiaryGoneCancellation {
  constructor(
    private readonly requests: AccessRequestRepo,
    private readonly lines: RequestLineRepo,
    private readonly licensing: LicensingApi,
    private readonly closing: BeneficiaryGoneClosing,
    private readonly itNotice: BeneficiaryGoneItNotice,
    private readonly budgets: BudgetsApi,
  ) {}

  async run(
    tx: DbTx,
    actor: SystemActor,
    input: BeneficiaryGoneInput,
    openRequestIds: readonly string[],
  ): Promise<BeneficiaryGoneResult> {
    const now = input.now ?? new Date();
    const result: BeneficiaryGoneResult = { cancelled: [], needsItCheck: [] };
    for (const requestId of openRequestIds) {
      const judged = await this.judge(tx, requestId, input);
      if (judged === null || judged.verdict === 'SKIP') continue;

      const item = { requestId, line: judged.line !== null };
      if (judged.verdict === 'NEEDS_IT_CHECK') {
        await this.itNotice.tell(tx, judged.request, input.employeeId, input.scope);
        result.needsItCheck.push(item);
        continue;
      }
      const cause = goneCauseOf(input.scope);
      if (judged.line === null) await this.closing.cancelRequest(tx, actor, judged.request, cause, now);
      else await this.closing.cancelLine(tx, actor, judged.request, judged.line, cause, now);
      result.cancelled.push(item);
    }

    return result;
  }

  /**
   * What `run` would do, read and never written (`P23`): each open request is judged by the same policy, from its state as it is read now,
   * and nothing is locked, so a request that moves meanwhile is judged again when the system really closes it. What the requests that
   * end hold of the budget comes from the budgets in one read. A request for a group is judged by the line of the person.
   */
  async preview(
    tx: DbTx,
    input: BeneficiaryGoneInput,
    openRequestIds: readonly string[],
  ): Promise<BeneficiaryGonePreview> {
    const wouldCancel: BeneficiaryGonePreviewItem[] = [];
    const needsItCheck: BeneficiaryGonePreviewItem[] = [];
    for (const requestId of openRequestIds) {
      const request = await this.requests.findById(requestId, tx);
      if (!request) continue;
      const [line = null] =
        request.type === 'GROUP_GRANT' ? await this.lines.read(tx, requestId, [input.employeeId]) : [];
      const verdict = verdictOf(input.scope, request, line?.state ?? null);
      if (verdict === 'SKIP') continue;
      const item = { requestId, line: line !== null, type: request.type, state: line?.state ?? request.state };
      (verdict === 'CANCEL' ? wouldCancel : needsItCheck).push(item);
    }
    const whole = wouldCancel.filter((item) => !item.line).map((item) => item.requestId);

    return { wouldCancel, needsItCheck, heldToRelease: await this.budgets.heldByRequests(whole, tx) };
  }

  /**
   * Locks the request (after the task of its grant) and says what is to be done with it, from what is read under the lock. Null when the
   * request is gone or is not the person's. The line is the person's own, locked, for a request for a group.
   */
  private async judge(
    tx: DbTx,
    requestId: string,
    input: BeneficiaryGoneInput,
  ): Promise<{ request: AccessRequestRecord; line: LineRecord | null; verdict: GoneVerdict } | null> {
    const first = await this.requests.findById(requestId, tx);
    if (!first) return null;
    const group = first.type === 'GROUP_GRANT';
    // The task of the grant is locked before the request, as the IT Admin who works the task locks them.
    await this.licensing.lockGrantOfRequest(tx, requestId, group ? input.employeeId : undefined);
    const request = await this.requests.lockById(tx, requestId);
    if (!request) return null;
    const [line = null] = group ? await this.lines.lock(tx, requestId, [input.employeeId]) : [];

    return { request, line, verdict: verdictOf(input.scope, request, line?.state ?? null) };
  }
}
