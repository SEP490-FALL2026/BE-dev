import { InvalidEmailError, normalizeEmail } from '../../../core/email';
import type { AuditEventInput, AuditValue } from '../../audit/public/audit.types';
import { RecoveryRefusedError } from '../public/recovery.errors';
import { RecoveryModeName, TicketRecord } from './recovery.repo';
import { RecoveryContext, RecoveryResult } from '../public/recovery.types';

// The rules every recovery run follows, whatever its mode: what a ticket reference looks like, who may run it, how a
// ticket run before answers, and what the Audit Trail records. Pure: no database, no clock.

/** A ticket reference is whatever the approval system calls the ticket; it is the key that makes a re-run a no-op. */
const TICKET_REFERENCE = /^[A-Za-z0-9][A-Za-z0-9._:/#-]{2,99}$/;
const FREE_TEXT_REFERENCE = /^[\x20-\x7e¡-￿]{2,100}$/;

const same = (a: string, b: string): boolean => a.trim().toLowerCase() === b.trim().toLowerCase();

export function tryNormalize(email: string): string | null {
  try {
    return normalizeEmail(email);
  } catch (error) {
    if (error instanceof InvalidEmailError) return null;
    throw error;
  }
}

export function assertContext(context: RecoveryContext): void {
  if (!TICKET_REFERENCE.test(context.ticketRef)) throw new RecoveryRefusedError('TICKET_REFERENCE_INVALID');
  for (const reference of [context.approverRef, context.operatorRef, context.identityCheckRef ?? 'xx']) {
    if (!FREE_TEXT_REFERENCE.test(reference)) throw new RecoveryRefusedError('TICKET_REFERENCE_INVALID');
  }
}

/**
 * In a shared environment the approver and the operator are two people, and the person who receives the link is not
 * the operator (AC-13). A local test environment lets one person do both, and the audit says it was a test.
 */
export function assertSeparation(context: RecoveryContext, recipients: string[]): void {
  if (context.environment !== 'SHARED') return;
  if (same(context.approverRef, context.operatorRef)) throw new RecoveryRefusedError('APPROVER_IS_OPERATOR');
  if (recipients.some((recipient) => recipient.trim() !== '' && same(recipient, context.operatorRef))) {
    throw new RecoveryRefusedError('RECIPIENT_IS_OPERATOR');
  }
}

export function parseNewEmail(raw: string): { raw: string; normalized: string } {
  const normalized = tryNormalize(raw);
  if (normalized === null) throw new RecoveryRefusedError('NEW_EMAIL_INVALID');

  return { raw: raw.trim(), normalized };
}

/**
 * The answer for a ticket that was run before, or null to carry on with it: a ticket of another kind or for other
 * parameters is refused; one completed is a no-op; one replaced by a newer ticket cannot be run any more (AC-11).
 */
export function checkSameTicket(
  ticket: TicketRecord,
  mode: RecoveryModeName,
  expected: { targetAppUserId: string | null },
): RecoveryResult | null {
  if (ticket.mode !== mode) throw new RecoveryRefusedError('TICKET_OF_ANOTHER_KIND');
  if (ticket.targetAppUserId !== expected.targetAppUserId) throw new RecoveryRefusedError('TICKET_PARAMETERS_DIFFER');
  if (ticket.status === 'SUPERSEDED') throw new RecoveryRefusedError('TICKET_SUPERSEDED');
  if (ticket.status === 'COMPLETED') return { ticketRef: ticket.ticketRef, mode, outcome: 'ALREADY_COMPLETED' };

  return null;
}

/** The audit event of an operator step: the ticket, who approved and who ran it, and whether it was a test. */
export function operatorEvent(
  context: RecoveryContext,
  organizationId: string,
  ticket: TicketRecord,
  action: string,
  resourceId: string,
  before: { [key: string]: AuditValue } | null,
  after: { [key: string]: AuditValue } | null,
): AuditEventInput {
  return {
    organizationId,
    actorKind: 'OPERATOR',
    operatorReference: context.ticketRef,
    action,
    resourceType: 'AppUser',
    resourceId,
    before,
    after: {
      ...(after ?? {}),
      ticket: context.ticketRef,
      approver: context.approverRef,
      operator: context.operatorRef,
      environment: context.environment,
      ...(context.identityCheckRef ? { identityCheck: context.identityCheckRef } : {}),
    },
    correlationId: ticket.id,
  };
}
