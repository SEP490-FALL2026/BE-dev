import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { GrantOutcome, GrantRequestAnswer, GrantRequestGate } from '../licensing.types';
import { RefusingGrantRequestGate } from './refusing-grant-request-gate.service';

/**
 * The gate the grant of a seat asks: it forwards to the gate the module of requests registered, and refuses every request
 * until one is. Registering rather than importing keeps the direction `requests -> licensing` (ADR-0015), the way the
 * catalog learns how seats are held (ADR-0013 item 4).
 */
@Injectable()
export class RegisteredGrantRequestGate implements GrantRequestGate {
  private delegate: GrantRequestGate = new RefusingGrantRequestGate();

  register(gate: GrantRequestGate): void {
    this.delegate = gate;
  }

  check(requestId: string, employeeId?: string): Promise<GrantRequestAnswer> {
    return this.delegate.check(requestId, employeeId);
  }

  claimForGrant(tx: DbTx, requestId: string, employeeId?: string): Promise<GrantRequestAnswer> {
    return this.delegate.claimForGrant(tx, requestId, employeeId);
  }

  reportOutcome(tx: DbTx, requestId: string, outcome: GrantOutcome, employeeId?: string): Promise<void> {
    return this.delegate.reportOutcome(tx, requestId, outcome, employeeId);
  }

  isWithdrawing(tx: DbTx, requestId: string, employeeId?: string): Promise<boolean> {
    return this.delegate.isWithdrawing(tx, requestId, employeeId);
  }

  reportCancelled(tx: DbTx, requestId: string, employeeId?: string): Promise<boolean> {
    return this.delegate.reportCancelled(tx, requestId, employeeId);
  }
}
