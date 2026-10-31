import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../../../infrastructure/database/transaction-runner';
import type { PersonnelActor } from '../../public/personnel.types';
import { OffboardingRefusedError } from '../offboarding.errors';
import { cancelRefusal } from '../offboarding.policy';
import { OffboardingFrame } from '../offboarding-frame.service';
import type { ChangeLastDayInput, OffboardingRecord } from '../offboarding.types';
import { OffboardingChangeJudge } from './offboarding-change-judge.service';
import { OffboardingChangeWriter } from './offboarding-change-writer.service';

/**
 * Moves the last working day of a handover under way, or cancels it (`US-03-04` AC-14, AC-15, AC-22, AC-26, AC-29). Both need a
 * reason and only a handover that is still under way, and both put the periods the record wrote back exactly (the placement is open
 * again, the head of the department is back) before they write again. A move is judged on the new day like a record: when the head
 * cannot be handed over there, the whole command is refused and nothing is saved. A cancellation takes no task away because none
 * was made, and the person is back to what they were doing, a long leave included when its day is still ahead.
 */
@Injectable()
export class OffboardingChangeService {
  constructor(
    private readonly frame: OffboardingFrame,
    private readonly judge: OffboardingChangeJudge,
    private readonly writer: OffboardingChangeWriter,
  ) {}

  /**
   * Moves the last working day. Throws OffboardingRefusedError and PersonnelAccessRefusedError. With `outer` it runs in the
   * transaction of the caller (the controlled procedure).
   */
  changeLastDay(
    actor: PersonnelActor,
    id: string,
    input: ChangeLastDayInput,
    outer?: DbTx,
  ): Promise<OffboardingRecord> {
    const chosenId = input.successor?.kind === 'EMPLOYEE' ? input.successor.employeeId : null;

    return this.frame.runEvent(
      actor,
      id,
      { lockDepartment: true, successorEmployeeId: chosenId, outer },
      async (tx, { held, today }) => {
        const judged = await this.judge.judge(tx, held, today, input);

        return this.writer.move(tx, actor, held, judged, input);
      },
    );
  }

  /** Cancels a handover under way. Throws OffboardingRefusedError. With `outer` it runs in the transaction of the caller. */
  cancel(actor: PersonnelActor, id: string, input: { reason: string }, outer?: DbTx): Promise<OffboardingRecord> {
    return this.frame.runEvent(actor, id, { lockDepartment: true, outer }, async (tx, { held, today }) => {
      const refusal = cancelRefusal({ state: held.state, reason: input.reason });
      if (refusal) throw new OffboardingRefusedError(refusal.code, refusal.details);

      return this.writer.cancel(tx, actor, held, { reason: input.reason.trim(), today });
    });
  }
}
