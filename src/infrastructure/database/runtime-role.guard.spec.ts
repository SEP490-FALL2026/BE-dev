import { ConfigService } from '@nestjs/config';
import { PrismaService } from './prisma.service';
import { RuntimeDatabaseRoleGuard, RuntimeDatabaseRoleRefusedError } from './runtime-role.guard';
import { RuntimeIdentityFacts } from './database-role-judgement';

const runtimeFacts: RuntimeIdentityFacts = {
  role: 'slm_runtime',
  superuser: false,
  createdb: false,
  createrole: false,
  replication: false,
  bypassrls: false,
  memberships: 0,
  ownsDatabase: false,
  ownedObjects: 0,
  sessionReplicationRole: 'origin',
};

function guard(
  nodeEnv: string,
  rows: RuntimeIdentityFacts[] | Error,
): { guard: RuntimeDatabaseRoleGuard; query: jest.Mock } {
  const query = jest.fn(() => (rows instanceof Error ? Promise.reject(rows) : Promise.resolve(rows)));
  const prisma = { $queryRaw: query } as unknown as PrismaService;
  const config = { get: jest.fn(() => nodeEnv) } as unknown as ConfigService<never, true>;
  return { guard: new RuntimeDatabaseRoleGuard(prisma, config), query };
}

describe('RuntimeDatabaseRoleGuard (H7: the API and the worker never run as an owner or a superuser)', () => {
  it.each(['development', 'test'])('does not query the database outside production (%s)', async (nodeEnv) => {
    const { guard: check, query } = guard(nodeEnv, [runtimeFacts]);

    await check.onModuleInit();

    expect(query).not.toHaveBeenCalled();
  });

  it('lets production start as the runtime role', async () => {
    const { guard: check, query } = guard('production', [runtimeFacts]);

    await expect(check.onModuleInit()).resolves.toBeUndefined();
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('stops production start-up as the cluster superuser, naming the role and the reasons only', async () => {
    const { guard: check } = guard('production', [
      { ...runtimeFacts, role: 'app', superuser: true, ownedObjects: 400 },
    ]);

    const failure = check.onModuleInit();

    await expect(failure).rejects.toBeInstanceOf(RuntimeDatabaseRoleRefusedError);
    await expect(failure).rejects.toThrow(
      'The database role "app" must not be used by the API or the worker: SUPERUSER, OWNS_OBJECTS',
    );
  });

  it('stops production start-up when the role cannot be read', async () => {
    await expect(guard('production', []).guard.onModuleInit()).rejects.toBeInstanceOf(RuntimeDatabaseRoleRefusedError);
    await expect(guard('production', new Error('connection refused')).guard.onModuleInit()).rejects.toThrow(
      'connection refused',
    );
  });
});
