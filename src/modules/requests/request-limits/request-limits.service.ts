import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../core/business-date';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { LicensingApi } from '../../licensing/public/licensing.api';
import { OperatingParametersApi } from '../../operating-parameters/public/operating-parameters.api';
import {
  AccessRequestManyPaidSoftwareReasonRequiredError,
  AccessRequestOpenLimitReachedError,
  AccessRequestOpenRequestExistsError,
} from '../access-request/access-request.errors';
import type { ManyPaidSoftwareFlag } from '../access-request/access-request.types';
import { RequestLimitsRepo } from './request-limits.repo';
import {
  judgeNewRequestLimits,
  manyPaidSoftwareReasonOf,
  type LimitExemption,
  type LimitVerdict,
} from './request-limits.policy';

/** GH-2 and GH-3 as the Super Admin set them, read before the transaction opens and applied to that sending (`QĐ-106h`(2)). */
export interface LimitSettings {
  openLimit: number;
  paidThreshold: number;
}

export interface LimitInput {
  employeeIds: readonly string[];
  planId: string | null;
  applicationId: string | null;
  today: BusinessDate;
  settings: LimitSettings;
  /** Why a person is exempt from GH-1/GH-2, when they are; nobody is in this release unless the caller says so. */
  exemptions?: ReadonlyMap<string, LimitExemption>;
}

/**
 * The limits of a request for new access (`BR-MF1-01` GH-1/GH-2/GH-3), for each person it is for: one read of the open requests and
 * one of the paid applications, however many people. Sending takes `lock` first, under the lock of the sender and before a department
 * is locked; a preview or a check locks nothing. It writes nothing: the callers refuse or record.
 */
@Injectable()
export class RequestLimitsService {
  constructor(
    private readonly repo: RequestLimitsRepo,
    private readonly licensing: LicensingApi,
    private readonly parameters: OperatingParametersApi,
  ) {}

  async settings(): Promise<LimitSettings> {
    return {
      openLimit: Number(await this.parameters.getValue('REQUEST_OPEN_NEW_LIMIT')),
      paidThreshold: Number(await this.parameters.getValue('PAID_SOFTWARE_FLAG_THRESHOLD')),
    };
  }

  lock(tx: DbTx, employeeIds: readonly string[]): Promise<void> {
    return this.repo.lockBeneficiaries(tx, employeeIds);
  }

  async judge(tx: DbTx, input: LimitInput): Promise<Map<string, LimitVerdict>> {
    const open = await this.repo.openNewRequestsOf(tx, input.employeeIds);
    const paid = await this.licensing.listPaidApplicationsOf(input.employeeIds, input.today, tx);

    return new Map(
      input.employeeIds.map((employeeId) => [
        employeeId,
        judgeNewRequestLimits({
          planId: input.planId,
          applicationId: input.applicationId,
          openNew: open.get(employeeId) ?? [],
          openLimit: input.settings.openLimit,
          paidApplicationIds: paid.get(employeeId) ?? new Set<string>(),
          paidThreshold: input.settings.paidThreshold,
          exemption: input.exemptions?.get(employeeId) ?? null,
        }),
      ]),
    );
  }

  /**
   * GH-1 (an open request of the plan), GH-2 and GH-3 of the person a request of one person is for, under the lock the caller took:
   * refused, or the flag the request carries (`BR-MF1-01`). Throws AccessRequestOpenRequestExistsError,
   * AccessRequestOpenLimitReachedError and AccessRequestManyPaidSoftwareReasonRequiredError.
   */
  async requireForOne(
    tx: DbTx,
    input: Omit<LimitInput, 'employeeIds'> & { employeeId: string; reason: string | null | undefined },
  ): Promise<ManyPaidSoftwareFlag | null> {
    const verdict = await this.judgeOne(tx, input);
    if (verdict.refusal === 'HAS_OPEN_REQUEST' && verdict.openRequestId !== null) {
      throw new AccessRequestOpenRequestExistsError(verdict.openRequestId);
    }
    if (verdict.refusal === 'OPEN_LIMIT_REACHED') {
      throw new AccessRequestOpenLimitReachedError(input.settings.openLimit, verdict.openRequestIds);
    }
    const given = manyPaidSoftwareReasonOf(verdict, input.reason);
    if (verdict.manyPaidSoftware === null) return null;
    if (given.reason === null) {
      throw new AccessRequestManyPaidSoftwareReasonRequiredError(
        verdict.manyPaidSoftware.count,
        verdict.manyPaidSoftware.threshold,
      );
    }

    return { count: verdict.manyPaidSoftware.count, reason: given.reason };
  }

  /** The verdict of one person (the request of one person). */
  async judgeOne(tx: DbTx, input: Omit<LimitInput, 'employeeIds'> & { employeeId: string }): Promise<LimitVerdict> {
    const verdicts = await this.judge(tx, { ...input, employeeIds: [input.employeeId] });
    const verdict = verdicts.get(input.employeeId);
    if (!verdict) throw new Error(`The limits of ${input.employeeId} were not judged.`);

    return verdict;
  }
}
