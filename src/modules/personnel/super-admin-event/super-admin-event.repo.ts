import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { SuperAdminEventMode } from '../../../generated/prisma/client';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { SuperAdminEventModeName } from '../public/super-admin-event.types';

/** The mode as the ticket table keeps it. */
const MODE_COLUMN: Readonly<Record<SuperAdminEventModeName, SuperAdminEventMode>> = {
  'transfer-record': 'TRANSFER_RECORD',
  'transfer-reschedule': 'TRANSFER_RESCHEDULE',
  'transfer-cancel': 'TRANSFER_CANCEL',
  'leave-start': 'LEAVE_START',
  'leave-return': 'LEAVE_RETURN',
  'departure-record': 'DEPARTURE_RECORD',
  'departure-change': 'DEPARTURE_CHANGE',
  'departure-cancel': 'DEPARTURE_CANCEL',
  'abrupt-departure-record': 'ABRUPT_DEPARTURE_RECORD',
  'profile-correct': 'PROFILE_CORRECT',
};

export interface TicketRow {
  id: string;
  mode: SuperAdminEventMode;
  subjectEmployeeId: string;
  parametersDigest: string;
}

/** The kinds of record a mode that changes an event names by id, and the table each is read from. */
export type RecordKind = 'TRANSFER' | 'LEAVE' | 'CASE';

/**
 * The one writer of `super_admin_event_tickets` (append-only: a trigger refuses to change or delete a row), and the reader of what the
 * command needs to know about the records it is asked to change, so it never asks the services of the events to search for them. The
 * ticket is the key that makes a run idempotent and the "who" of every event the run writes.
 */
@Injectable()
export class SuperAdminEventRepo {
  modeColumn(mode: SuperAdminEventModeName): SuperAdminEventMode {
    return MODE_COLUMN[mode];
  }

  /** The ticket of this reference, if one was recorded. */
  async findTicket(tx: DbTx, organizationId: string, ticketRef: string): Promise<TicketRow | null> {
    const row = await tx.superAdminEventTicket.findUnique({
      where: { organizationId_ticketRef: { organizationId, ticketRef } },
      select: { id: true, mode: true, subjectEmployeeId: true, parametersDigest: true },
    });

    return row;
  }

  async insertTicket(
    tx: DbTx,
    input: {
      organizationId: string;
      ticketRef: string;
      mode: SuperAdminEventModeName;
      subjectEmployeeId: string;
      parametersDigest: string;
      approverRef: string;
      operatorRef: string;
      environment: string;
    },
  ): Promise<{ id: string }> {
    const created = await tx.superAdminEventTicket.create({
      data: {
        id: randomUUID(),
        organizationId: input.organizationId,
        ticketRef: input.ticketRef,
        mode: MODE_COLUMN[input.mode],
        subjectEmployeeId: input.subjectEmployeeId,
        parametersDigest: input.parametersDigest,
        approverRef: input.approverRef,
        operatorRef: input.operatorRef,
        environment: input.environment,
      },
      select: { id: true },
    });

    return created;
  }

  /**
   * The record a run of the ticket wrote or changed: the transfer, the leave or the case it is about, found by the ticket that is the
   * "who" of what it wrote. Null when the ticket wrote nothing (it is never so for a ticket that was completed).
   */
  async recordOfTicket(tx: DbTx, ticketId: string, mode: SuperAdminEventModeName): Promise<string | null> {
    switch (mode) {
      case 'transfer-record':
        return (
          (await tx.departmentTransfer.findFirst({ where: { recordedByTicketId: ticketId }, select: { id: true } }))
            ?.id ?? null
        );
      case 'transfer-reschedule':
      case 'transfer-cancel':
        return (
          (
            await tx.departmentTransferChange.findFirst({
              where: { changedByTicketId: ticketId },
              select: { transferId: true },
            })
          )?.transferId ?? null
        );
      case 'leave-start':
        return (
          (await tx.employeeLeave.findFirst({ where: { startedByTicketId: ticketId }, select: { id: true } }))?.id ??
          null
        );
      case 'leave-return':
        return (
          (
            await tx.employeeLeaveChange.findFirst({
              where: { recordedByTicketId: ticketId },
              select: { leaveId: true },
            })
          )?.leaveId ?? null
        );
      case 'departure-record':
      case 'abrupt-departure-record':
        return (
          (await tx.offboardingCase.findFirst({ where: { recordedByTicketId: ticketId }, select: { id: true } }))?.id ??
          null
        );
      case 'departure-change':
      case 'departure-cancel':
        return (
          (
            await tx.offboardingCaseChange.findFirst({
              where: { changedByTicketId: ticketId },
              select: { caseId: true },
            })
          )?.caseId ?? null
        );
      case 'profile-correct':
        // The record of an employee has no column for the ticket: the ticket names the person, and that person is the record.
        return (
          (await tx.superAdminEventTicket.findUnique({ where: { id: ticketId }, select: { subjectEmployeeId: true } }))
            ?.subjectEmployeeId ?? null
        );
    }
  }

  /** The person a transfer, a leave or a departure case is about; null when it does not exist. */
  async employeeOf(tx: DbTx, kind: RecordKind, id: string): Promise<string | null> {
    if (kind === 'TRANSFER') {
      return (
        (await tx.departmentTransfer.findUnique({ where: { id }, select: { employeeId: true } }))?.employeeId ?? null
      );
    }
    if (kind === 'LEAVE') {
      return (await tx.employeeLeave.findUnique({ where: { id }, select: { employeeId: true } }))?.employeeId ?? null;
    }

    return (await tx.offboardingCase.findUnique({ where: { id }, select: { employeeId: true } }))?.employeeId ?? null;
  }

  /** The person and the kind of a notice of a head; null when it does not exist. */
  async noticeOf(tx: DbTx, id: string): Promise<{ employeeId: string; kind: string } | null> {
    return tx.personnelNotice.findUnique({ where: { id }, select: { employeeId: true, kind: true } });
  }
}
