import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client';
import { EnvironmentVariables } from '../config/env-schema';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor(config: ConfigService<EnvironmentVariables, true>) {
    // DATABASE_URL is already resolved per environment by validateEnvironment, so this
    // adapter has nothing left to decide.
    const adapter = new PrismaPg({
      connectionString: config.get('DATABASE_URL', { infer: true }),
      // The adapter reads and writes timestamptz as if the session zone were UTC. On a server
      // whose default TimeZone is anything else, every instant is silently shifted by the offset
      // (observed on a PostgreSQL started in Asia/Bangkok). Pin the zone per connection so the
      // result does not depend on how the database server was installed.
      options: '-c TimeZone=UTC',
    });
    super({ adapter });
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
