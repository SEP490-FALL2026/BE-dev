import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../infrastructure/database/database.module';

/**
 * The policy library (`QĐ-111ao`): the fixed set of policies the Super Admin publishes new versions of, the acknowledgement of
 * the reader, the checklist of a decision and the template files of the imports. The capabilities are added as the packages
 * PL-1, PL-2 and PL-3 land; the module card lists what is wired.
 */
@Module({
  imports: [DatabaseModule],
})
export class PoliciesModule {}
