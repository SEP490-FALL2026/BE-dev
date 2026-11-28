import { Inject, Injectable } from '@nestjs/common';
import type { ActionTokenRepo } from '../accounts/action-token.repo';
import { SessionRepo } from '../auth/session.repo';

export const DEAD_SESSION_RETENTION_DAYS = 30;
export const SPENT_ACTION_TOKEN_RETENTION_DAYS = 30;
export const HOUSEKEEPING_ACTION_TOKENS = Symbol('HOUSEKEEPING_ACTION_TOKENS');

@Injectable()
export class AuthHousekeepingApi {
  constructor(
    private readonly sessions: SessionRepo,
    @Inject(HOUSEKEEPING_ACTION_TOKENS) private readonly tokens: ActionTokenRepo,
  ) {}

  purgeDeadSessionTokens(before: Date, limit: number): Promise<number> {
    return this.sessions.purgeDeadSessionTokens(before, limit);
  }

  purgeDeadSessions(before: Date, limit: number): Promise<number> {
    return this.sessions.purgeDeadSessions(before, limit);
  }

  purgeSpentActionTokens(before: Date, limit: number): Promise<number> {
    return this.tokens.purgeSpentActionTokens(before, limit);
  }

  purgeIdleLoginThrottles(now: Date, limit: number): Promise<number> {
    return this.sessions.purgeIdleLoginThrottles(now, limit);
  }
}
