import type { AuthenticatedPrincipal } from '../../infrastructure/security/tokens/access-token-verifier.port';
import { licensingAuditEvent } from './licensing-audit-event.mapper';

const actor: AuthenticatedPrincipal = {
  subject: 'account-1',
  appUserId: 'account-1',
  sessionId: 'session-1',
  employeeId: 'employee-1',
  directRoles: ['SUPER_ADMIN'],
  derivedRoles: [],
  roles: ['SUPER_ADMIN'],
};
const after = { dueOn: '2026-11-10' };

/**
 * The Audit Trail names the person who did an event. A person who signed in is
 * `USER`; the controlled procedure `ops:record-super-admin-event` is `OPERATOR` — no account, the ticket as the reference and the
 * correlation — even though the facade is still handed the account of the Super Admin it serves for the columns that demand one.
 */
describe('licensingAuditEvent', () => {
  it('is the USER with their account, their roles and their session when nobody else is named', () => {
    expect(licensingAuditEvent(actor, 'org-1', 'HANDOVER_DUTY.OPENED', 'HandoverDuty', 'duty-1', null, after)).toEqual({
      organizationId: 'org-1',
      actorKind: 'USER',
      actorAppUserId: 'account-1',
      actorRoles: ['SUPER_ADMIN'],
      action: 'HANDOVER_DUTY.OPENED',
      resourceType: 'HandoverDuty',
      resourceId: 'duty-1',
      before: null,
      after,
      correlationId: 'session-1',
    });
  });

  it('is the OPERATOR when the controlled procedure asks: no account, no roles, the ticket as the reference and the correlation, and never the stand-in account', () => {
    const event = licensingAuditEvent(
      actor,
      'org-1',
      'HANDOVER_DUTY.DUE_CHANGED',
      'HandoverDuty',
      'duty-1',
      after,
      after,
      {
        ticketId: 'ticket-row-1',
        ticketRef: 'R-2026-001',
        context: { ticket: 'R-2026-001', mode: 'departure-change' },
      },
    );

    expect(event).toEqual({
      organizationId: 'org-1',
      actorKind: 'OPERATOR',
      actorAppUserId: null,
      actorRoles: [],
      action: 'HANDOVER_DUTY.DUE_CHANGED',
      resourceType: 'HandoverDuty',
      resourceId: 'duty-1',
      before: after,
      after: { dueOn: '2026-11-10', ticket: 'R-2026-001', mode: 'departure-change' },
      correlationId: 'ticket-row-1',
      operatorReference: 'R-2026-001',
    });
    expect(JSON.stringify(event)).not.toContain('account-1');
    expect(JSON.stringify(event)).not.toContain('session-1');
  });

  it('keeps what the event says after the change as it is when the procedure adds no context, and writes a null after as null', () => {
    const operator = { ticketId: 'ticket-row-1', ticketRef: 'R-2026-001' };

    expect(
      licensingAuditEvent(actor, 'org-1', 'HANDOVER_DUTY.CANCELLED', 'HandoverDuty', 'duty-1', null, after, operator)
        .after,
    ).toEqual(after);
    expect(
      licensingAuditEvent(actor, 'org-1', 'HANDOVER_DUTY.CANCELLED', 'HandoverDuty', 'duty-1', null, null, operator)
        .after,
    ).toBeNull();
  });
});
