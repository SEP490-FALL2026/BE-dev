import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { DbTx } from '../../infrastructure/database/transaction-runner';

export type RecoveryModeName = 'RESET_CREDENTIALS' | 'UNLOCK' | 'TRANSFER_ROLE';
export type RecoveryStatusName = 'PENDING' | 'AWAITING_ACTIVATION' | 'COMPLETED' | 'SUPERSEDED';

export interface TicketRecord {
  id: string;
  organizationId: string;
  ticketRef: string;
  mode: RecoveryModeName;
  status: RecoveryStatusName;
  targetAppUserId: string | null;
  successorEmployeeId: string | null;
  recipientEmail: string | null;
  newLoginEmail: string | null;
  approverRef: string;
  operatorRef: string;
  identityCheckRef: string | null;
  environment: 'LOCAL_TEST' | 'SHARED';
  createdAt: Date;
  completedAt: Date | null;
}

const TICKET_SELECT = {
  id: true,
  organizationId: true,
  ticketRef: true,
  mode: true,
  status: true,
  targetAppUserId: true,
  successorEmployeeId: true,
  recipientEmail: true,
  newLoginEmail: true,
  approverRef: true,
  operatorRef: true,
  identityCheckRef: true,
  environment: true,
  createdAt: true,
  completedAt: true,
} as const;

/** A ticket in one of these states has not finished: it has not completed and no newer ticket replaced it. */
const WAITING_STATUSES: RecoveryStatusName[] = ['PENDING', 'AWAITING_ACTIVATION'];

/** Owns RecoveryTicket (US-01-09): the approved tickets of the procedure that recovers the Super Admin role. */
@Injectable()
export class RecoveryRepo {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Takes the ticket's row lock, creating the ticket first if it does not exist yet: two operators running the same
   * reference at once meet here, one after the other. Returns the ticket as it is now and whether this call made it.
   */
  async openAndLock(
    tx: DbTx,
    input: {
      organizationId: string;
      ticketRef: string;
      mode: RecoveryModeName;
      targetAppUserId: string | null;
      successorEmployeeId: string | null;
      recipientEmail: string | null;
      newLoginEmail: string | null;
      approverRef: string;
      operatorRef: string;
      identityCheckRef: string | null;
      environment: 'LOCAL_TEST' | 'SHARED';
    },
  ): Promise<{ ticket: TicketRecord; created: boolean }> {
    const inserted = await tx.$queryRaw<{ id: string }[]>`
      INSERT INTO recovery_tickets (id, organization_id, ticket_ref, mode, target_app_user_id, successor_employee_id,
                                    recipient_email, new_login_email, approver_ref, operator_ref, identity_check_ref,
                                    environment)
      VALUES (gen_random_uuid(), ${input.organizationId}::uuid, ${input.ticketRef}, ${input.mode}::"RecoveryMode",
              ${input.targetAppUserId}::uuid, ${input.successorEmployeeId}::uuid, ${input.recipientEmail},
              ${input.newLoginEmail}, ${input.approverRef}, ${input.operatorRef}, ${input.identityCheckRef},
              ${input.environment})
      ON CONFLICT (organization_id, ticket_ref) DO NOTHING
      RETURNING id`;
    await tx.$queryRaw`
      SELECT id FROM recovery_tickets WHERE organization_id = ${input.organizationId}::uuid
         AND ticket_ref = ${input.ticketRef} FOR UPDATE`;
    const ticket = await tx.recoveryTicket.findUniqueOrThrow({
      where: { organizationId_ticketRef: { organizationId: input.organizationId, ticketRef: input.ticketRef } },
      select: TICKET_SELECT,
    });

    return { ticket: this.toRecord(ticket), created: inserted.length === 1 };
  }

  /** A ticket that is already completed: terminal, so it is safe to read without its lock. */
  async findCompleted(tx: DbTx, organizationId: string, ticketRef: string): Promise<TicketRecord | null> {
    const ticket = await tx.recoveryTicket.findFirst({
      where: { organizationId, ticketRef, status: 'COMPLETED' },
      select: TICKET_SELECT,
    });

    return ticket ? this.toRecord(ticket) : null;
  }

  async setStatus(
    tx: DbTx,
    id: string,
    status: RecoveryStatusName,
    now: Date,
    extra: { recipientEmail?: string | null; newLoginEmail?: string | null } = {},
  ): Promise<void> {
    await tx.recoveryTicket.update({
      where: { id },
      data: { status, updatedAt: now, completedAt: status === 'COMPLETED' ? now : null, ...extra },
    });
  }

  /** The tickets of the account still waiting: they are replaced when a newer ticket takes the account (AC-11). */
  async pendingForTarget(tx: DbTx, appUserId: string, exceptTicketId: string): Promise<{ id: string }[]> {
    return tx.recoveryTicket.findMany({
      where: {
        targetAppUserId: appUserId,
        id: { not: exceptTicketId },
        mode: 'RESET_CREDENTIALS',
        status: { in: WAITING_STATUSES },
      },
      select: { id: true },
    });
  }

  /**
   * Whether the account is waiting for an operator's credential reset (US-01-10 AC-10). The caller holds the AppUser
   * row lock, which the recovery also takes before it writes the ticket, so a ticket committed meanwhile is seen here.
   */
  async hasWaitingCredentialReset(tx: DbTx, organizationId: string, appUserId: string): Promise<boolean> {
    const waiting = await tx.recoveryTicket.findFirst({
      where: {
        organizationId,
        targetAppUserId: appUserId,
        mode: 'RESET_CREDENTIALS',
        status: { in: WAITING_STATUSES },
      },
      select: { id: true },
    });

    return waiting !== null;
  }

  /** The ticket a link belongs to, locked, for the redemption that completes it. */
  async lockById(tx: DbTx, id: string): Promise<TicketRecord | null> {
    const rows = await tx.$queryRaw<
      { id: string }[]
    >`SELECT id FROM recovery_tickets WHERE id = ${id}::uuid FOR UPDATE`;
    if (rows.length === 0) return null;
    const ticket = await tx.recoveryTicket.findUnique({ where: { id }, select: TICKET_SELECT });

    return ticket ? this.toRecord(ticket) : null;
  }

  /** Ends every session of the account: the operator's reset leaves the owner signed out everywhere (AC-9). */
  async revokeSessions(tx: DbTx, appUserId: string, now: Date): Promise<number> {
    const result = await tx.authSession.updateMany({
      where: { appUserId, revokedAt: null },
      data: { revokedAt: now, revokedReason: 'PASSWORD_RESET' },
    });

    return result.count;
  }

  private toRecord(row: {
    id: string;
    organizationId: string;
    ticketRef: string;
    mode: RecoveryModeName;
    status: RecoveryStatusName;
    targetAppUserId: string | null;
    successorEmployeeId: string | null;
    recipientEmail: string | null;
    newLoginEmail: string | null;
    approverRef: string;
    operatorRef: string;
    identityCheckRef: string | null;
    environment: string;
    createdAt: Date;
    completedAt: Date | null;
  }): TicketRecord {
    return { ...row, environment: row.environment === 'LOCAL_TEST' ? 'LOCAL_TEST' : 'SHARED' };
  }
}
