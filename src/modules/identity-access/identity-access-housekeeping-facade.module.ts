import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../infrastructure/database/database.module';
import { ActionTokenRepo } from './accounts/action-token.repo';
import { SessionRepo } from './auth/session.repo';
import { AuthHousekeepingApi, HOUSEKEEPING_ACTION_TOKENS } from './public/auth-housekeeping.api';

@Module({
  imports: [DatabaseModule],
  providers: [AuthHousekeepingApi, SessionRepo, { provide: HOUSEKEEPING_ACTION_TOKENS, useClass: ActionTokenRepo }],
  exports: [AuthHousekeepingApi],
})
export class IdentityAccessHousekeepingFacadeModule {}
