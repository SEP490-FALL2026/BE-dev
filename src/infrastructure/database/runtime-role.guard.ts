import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DatabaseEnvironmentVariables } from '../config/env-schema';
import { PrismaService } from './prisma.service';
import { RuntimeIdentityFacts, judgeRuntimeIdentity } from './database-role-judgement';

/** The API or the worker was started with a login that may administer the database (H7: F-15, DB-04, Q9). */
export class RuntimeDatabaseRoleRefusedError extends Error {
  constructor(role: string, reasons: readonly string[]) {
    super(
      `The database role "${role}" must not be used by the API or the worker: ${reasons.join(', ')}. ` +
        'Use the runtime role (docs/guides/containers.md#postgresql-roles-h7).',
    );
    this.name = 'RuntimeDatabaseRoleRefusedError';
  }
}

/**
 * In production the API and the worker check their own PostgreSQL login before any work starts: `onModuleInit` runs
 * before every `onApplicationBootstrap` (the mail loop, the document sweeper). A superuser, an owner of the database or
 * of any object (the deploy role), a member of another role or a session with triggers silenced stops the start-up.
 * Outside production nothing is queried: local Compose and the test harness connect as the owner of their database.
 */
@Injectable()
export class RuntimeDatabaseRoleGuard implements OnModuleInit {
  private readonly logger = new Logger(RuntimeDatabaseRoleGuard.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<DatabaseEnvironmentVariables, true>,
  ) {}

  async onModuleInit(): Promise<void> {
    if (this.config.get('NODE_ENV', { infer: true }) !== 'production') return;

    const [facts] = await this.prisma.$queryRaw<RuntimeIdentityFacts[]>`
      SELECT r.rolname AS role, r.rolsuper AS superuser, r.rolcreatedb AS createdb, r.rolcreaterole AS createrole,
             r.rolreplication AS replication, r.rolbypassrls AS bypassrls,
             (SELECT count(*)::int FROM pg_auth_members m WHERE m.member = r.oid) AS memberships,
             EXISTS (SELECT 1 FROM pg_database d WHERE d.datname = current_database() AND d.datdba = r.oid) AS "ownsDatabase",
             ((SELECT count(*) FROM pg_class c WHERE c.relowner = r.oid)
               + (SELECT count(*) FROM pg_proc p WHERE p.proowner = r.oid)
               + (SELECT count(*) FROM pg_type t WHERE t.typowner = r.oid)
               + (SELECT count(*) FROM pg_namespace n WHERE n.nspowner = r.oid))::int AS "ownedObjects",
             current_setting('session_replication_role') AS "sessionReplicationRole"
        FROM pg_roles r
       WHERE r.rolname = current_user`;
    if (!facts) throw new RuntimeDatabaseRoleRefusedError('current_user', ['ROLE_NOT_READABLE']);

    const reasons = judgeRuntimeIdentity(facts);
    if (reasons.length > 0) throw new RuntimeDatabaseRoleRefusedError(facts.role, reasons);
    this.logger.log(`Database role "${facts.role}" is a runtime role`);
  }
}
