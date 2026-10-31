import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { ChangeLastDayInput } from '../offboarding/offboarding.types';
import type { PersonnelActor } from '../public/personnel.types';

/**
 * The two changes of a departure under way that an event about the Super Admin can make, as far as the writer of the departure events
 * needs them: the last working day moved, the handover cancelled. They belong to the `change/` group of `offboarding/`, which no other
 * capability reaches, so the events name the two writes here and `SuperAdminEventCliModule` binds them to the service that answers
 * them (`OffboardingChangeService`), as the rules of the application do.
 */
export abstract class DepartureChanges {
  abstract changeLastDay(
    actor: PersonnelActor,
    id: string,
    input: ChangeLastDayInput,
    outer: DbTx,
  ): Promise<{ id: string }>;

  abstract cancel(actor: PersonnelActor, id: string, input: { reason: string }, outer: DbTx): Promise<{ id: string }>;
}
