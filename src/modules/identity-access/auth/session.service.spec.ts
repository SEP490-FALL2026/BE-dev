import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHash } from 'node:crypto';
import { TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import { AuditService } from '../../audit/audit.service';
import { OrganizationService } from '../../organization/organization.service';
import { AccountRepo } from '../accounts/account.repo';
import { RefreshTokenSnapshot, SessionSnapshot } from '../identity-access.types';
import { SessionInvalidError } from './auth.errors';
import { SessionRepo } from './session.repo';
import { SessionService } from './session.service';
import { TokenService } from './token.service';

const IDLE_SECONDS = 28_800;
const ACCESS_SECONDS = 600;
const APP_USER = '3f0c7d54-9e1b-4f6a-8d2c-5b7a1e9c0d11';
const SESSION = 'a8b6c4d2-1f3e-4a5b-9c7d-0e2f4a6b8c10';
const PRESENTED = 'p'.repeat(43);
const PRESENTED_HASH = createHash('sha256').update(PRESENTED).digest('hex');

/** A write the service asked for, recorded against the transaction that made it. */
type Write =
  | { kind: 'consume'; tokenHash: string }
  | { kind: 'insert'; tokenHash: string; expiresAt: Date }
  | { kind: 'touch'; idleExpiresAt: Date }
  | { kind: 'revoke'; reason: string }
  | { kind: 'audit'; action: string };

type FakeTx = { pending: Write[] };
const pendingOf = (tx: unknown): Write[] => (tx as FakeTx).pending;

/** Like TransactionRunner: writes become visible only when the callback returns; a throw discards them. */
class CommitTrackingRunner {
  committed: Write[] = [];
  opened = 0;

  async run<T>(work: (tx: FakeTx) => Promise<T>): Promise<T> {
    this.opened += 1;
    const tx: FakeTx = { pending: [] };
    const result = await work(tx);
    this.committed.push(...tx.pending);

    return result;
  }
}

interface World {
  session: SessionSnapshot;
  token: RefreshTokenSnapshot;
}

function setUp(world: World) {
  const runner = new CommitTrackingRunner();
  const config = new ConfigService({
    AUTH_SESSION_IDLE_SECONDS: IDLE_SECONDS,
    AUTH_ACCESS_TOKEN_TTL_SECONDS: ACCESS_SECONDS,
  });
  const jwt = new JwtService({
    secret: 'unit-test-secret-unit-test-secret-unit-test',
    signOptions: { expiresIn: 600 },
  });
  const tokens = new TokenService(jwt, config as never);
  const sessions = {
    findRefreshTokenOwner: (hash: string) =>
      Promise.resolve(hash === world.token.tokenHash ? { sessionId: world.session.id, appUserId: APP_USER } : null),
    lockSession: () => Promise.resolve(world.session),
    lockRefreshToken: () => Promise.resolve(world.token),
    consumeRefreshToken: (tx: unknown, tokenHash: string) => {
      pendingOf(tx).push({ kind: 'consume', tokenHash });
      return Promise.resolve();
    },
    insertRefreshToken: (tx: unknown, input: { tokenHash: string; expiresAt: Date }) => {
      pendingOf(tx).push({ kind: 'insert', tokenHash: input.tokenHash, expiresAt: input.expiresAt });
      return Promise.resolve();
    },
    touchSession: (tx: unknown, _id: string, input: { idleExpiresAt: Date }) => {
      pendingOf(tx).push({ kind: 'touch', idleExpiresAt: input.idleExpiresAt });
      return Promise.resolve();
    },
    revokeSession: (tx: unknown, _id: string, reason: string) => {
      pendingOf(tx).push({ kind: 'revoke', reason });
      return Promise.resolve(true);
    },
  };
  const accounts = {
    lockAppUser: () => Promise.resolve(true),
    readAccount: () =>
      Promise.resolve({
        id: APP_USER,
        employeeId: 'employee',
        organizationId: 'organization',
        status: 'ACTIVE',
        activationState: 'ACTIVATED',
      }),
  };
  const organization = { getEmployee: () => Promise.resolve({ status: 'ACTIVE' }) };
  const audit = {
    record: (tx: unknown, event: { action: string }) => {
      pendingOf(tx).push({ kind: 'audit', action: event.action });
      return Promise.resolve();
    },
  };
  const service = new SessionService(
    accounts as unknown as AccountRepo,
    sessions as unknown as SessionRepo,
    organization as unknown as OrganizationService,
    audit as unknown as AuditService,
    tokens,
    runner as unknown as TransactionRunner,
    config as never,
  );

  return { service, runner };
}

const inSeconds = (seconds: number): Date => new Date(Date.now() + seconds * 1000);

function openWorld(
  overrides: { session?: Partial<SessionSnapshot>; token?: Partial<RefreshTokenSnapshot> } = {},
): World {
  return {
    session: {
      id: SESSION,
      appUserId: APP_USER,
      revokedAt: null,
      idleExpiresAt: inSeconds(3_600),
      absoluteExpiresAt: inSeconds(6 * 24 * 3_600),
      ...overrides.session,
    },
    token: {
      tokenHash: PRESENTED_HASH,
      sessionId: SESSION,
      expiresAt: inSeconds(3_600),
      consumedAt: null,
      ...overrides.token,
    },
  };
}

const insertedOf = (writes: Write[]) => writes.filter((write) => write.kind === 'insert');

describe('SessionService.refresh — the refresh-token state machine', () => {
  it('rotates a valid token and returns the stored expiry of the next refresh token', async () => {
    const world = openWorld();
    const { service, runner } = setUp(world);
    const before = Date.now();

    const issued = await service.refresh(PRESENTED);

    const inserted = insertedOf(runner.committed);
    expect(inserted).toHaveLength(1);
    expect(issued.refreshTokenExpiresAt).toEqual((inserted[0] as { expiresAt: Date }).expiresAt);
    expect(issued.refreshTokenExpiresAt).not.toEqual(world.token.expiresAt);
    expect(issued.refreshTokenExpiresAt).not.toEqual(issued.accessTokenExpiresAt);
    // Unchanged TTLs: the next refresh token lives for the idle TTL, the access token for its own TTL.
    expect(issued.refreshTokenExpiresAt.getTime() - before).toBeGreaterThanOrEqual(IDLE_SECONDS * 1000);
    expect(issued.refreshTokenExpiresAt.getTime() - Date.now()).toBeLessThanOrEqual(IDLE_SECONDS * 1000);
    expect(issued.accessTokenExpiresAt.getTime() - before).toBeGreaterThanOrEqual(ACCESS_SECONDS * 1000);
    expect(issued.accessTokenExpiresAt.getTime() - Date.now()).toBeLessThanOrEqual(ACCESS_SECONDS * 1000);
    expect(runner.committed.map((write) => write.kind)).toEqual(['consume', 'insert', 'touch']);
    expect(runner.committed).toContainEqual({ kind: 'consume', tokenHash: PRESENTED_HASH });
  });

  it('caps the next refresh token at the absolute session expiry and reports exactly that', async () => {
    const absoluteExpiresAt = inSeconds(90);
    const { service, runner } = setUp(openWorld({ session: { absoluteExpiresAt } }));

    const issued = await service.refresh(PRESENTED);

    expect(issued.refreshTokenExpiresAt).toEqual(absoluteExpiresAt);
    expect(insertedOf(runner.committed)).toEqual([expect.objectContaining({ expiresAt: absoluteExpiresAt })]);
    expect(runner.committed).toContainEqual({ kind: 'touch', idleExpiresAt: absoluteExpiresAt });
  });

  it('treats a spent, unexpired token as replay: commits revoke and audit, mints nothing, then refuses', async () => {
    const { service, runner } = setUp(openWorld({ token: { consumedAt: inSeconds(-60) } }));

    await expect(service.refresh(PRESENTED)).rejects.toBeInstanceOf(SessionInvalidError);

    expect(runner.committed).toEqual([
      { kind: 'revoke', reason: 'REPLAY_DETECTED' },
      { kind: 'audit', action: 'SESSION.REVOKED' },
    ]);
  });

  it.each([
    ['expired and unconsumed', { expiresAt: inSeconds(-1), consumedAt: null }],
    ['expired and already consumed', { expiresAt: inSeconds(-1), consumedAt: inSeconds(-120) }],
  ])('refuses a token that is %s without treating it as replay or writing anything', async (_label, token) => {
    const { service, runner } = setUp(openWorld({ token }));

    await expect(service.refresh(PRESENTED)).rejects.toBeInstanceOf(SessionInvalidError);

    expect(runner.committed).toEqual([]);
  });

  it('refuses a token of a revoked session without writing anything', async () => {
    const { service, runner } = setUp(openWorld({ session: { revokedAt: inSeconds(-5) } }));

    await expect(service.refresh(PRESENTED)).rejects.toBeInstanceOf(SessionInvalidError);

    expect(runner.committed).toEqual([]);
  });

  it.each([
    ['missing', undefined],
    ['malformed', 'short'],
    ['unknown', 'u'.repeat(43)],
  ])('refuses a %s token before opening a transaction', async (_label, presented) => {
    const { service, runner } = setUp(openWorld());

    await expect(service.refresh(presented)).rejects.toBeInstanceOf(SessionInvalidError);

    expect(runner.opened).toBe(0);
  });
});
