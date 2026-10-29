import { Injectable, OnModuleInit } from '@nestjs/common';
import { CommitmentReleaseGuardHook, type CommitmentReleaseGuard } from '../../budgets/public/budgets.extension-points';
import { AccessRequestRepo } from '../access-request/access-request.repo';
import type { AccessRequestState } from '../access-request/access-request.types';

/** The states in which nothing is left to happen to the request, so that no spend can still come from it. */
const ENDED: readonly AccessRequestState[] = [
  'COMPLETED',
  'FAILED',
  'REJECTED',
  'IT_REJECTED',
  'WITHDRAWN',
  'CANCELLED',
];

/**
 * Tells the budgets whether the request a commitment is held for has ended, which is when Finance may let what is left of it
 * go (`US-06-06` AC-6). While the request can still be granted or bought, what it holds is not a remainder. It binds itself to the
 * budgets' hook when the module starts, so the budgets never import this module (ADR-0016).
 */
@Injectable()
export class RequestCommitmentReleaseGuard implements CommitmentReleaseGuard, OnModuleInit {
  constructor(
    private readonly requests: AccessRequestRepo,
    private readonly hook: CommitmentReleaseGuardHook,
  ) {}

  onModuleInit(): void {
    this.hook.bind(this);
  }

  async canReleaseRemainder(requestId: string): Promise<boolean> {
    const request = await this.requests.findById(requestId);

    return request === null || ENDED.includes(request.state);
  }
}
