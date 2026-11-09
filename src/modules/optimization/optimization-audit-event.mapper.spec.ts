import type { AuthenticatedPrincipal } from '../../infrastructure/security/tokens/access-token-verifier.port';
import { ghostSeatAuditEvent } from './optimization-audit-event.mapper';

const ORGANIZATION = '11111111-1111-4111-8111-111111111111';
const RECOMMENDATION = '22222222-2222-4222-8222-222222222222';

describe('ghost seat audit event', () => {
  it('writes a system act with no account and no role', () => {
    const event = ghostSeatAuditEvent({ kind: 'SYSTEM' }, ORGANIZATION, 'GHOST_SEAT.CREATED', RECOMMENDATION, null, {
      state: 'OPEN',
    });

    expect(event).toMatchObject({
      actorKind: 'SYSTEM',
      actorAppUserId: null,
      actorRoles: [],
      action: 'GHOST_SEAT.CREATED',
      resourceType: 'GHOST_SEAT_RECOMMENDATION',
      resourceId: RECOMMENDATION,
      before: null,
      after: { state: 'OPEN' },
      correlationId: `ghost-seat:${RECOMMENDATION}`,
    });
  });

  it('writes the act of a person as themselves, correlated by their session', () => {
    const principal: AuthenticatedPrincipal = {
      subject: 'a',
      appUserId: '33333333-3333-4333-8333-333333333333',
      sessionId: 'session-1',
      employeeId: '44444444-4444-4444-8444-444444444444',
      directRoles: ['IT_ADMIN'],
      roles: ['IT_ADMIN'],
    };

    const event = ghostSeatAuditEvent(
      { kind: 'USER', principal },
      ORGANIZATION,
      'GHOST_SEAT.RECLAIM_OPENED',
      RECOMMENDATION,
      { state: 'OPEN' },
      { state: 'RECLAIM_DECIDED', byInCharge: false },
    );

    expect(event).toMatchObject({
      actorKind: 'USER',
      actorAppUserId: principal.appUserId,
      actorRoles: ['IT_ADMIN'],
      correlationId: 'session-1',
      after: { byInCharge: false },
    });
  });
});
