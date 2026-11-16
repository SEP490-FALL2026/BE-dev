import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { LibraryRepo } from '../library/library.repo';
import type { PolicyRecord } from '../library/library.types';
import type { PolicyRole } from '../public/policies.types';
import { acknowledgementStateOf, type MyAcknowledgement } from './acknowledgement.policy';
import { AcknowledgementRepo } from './acknowledgement.repo';

/** Who is asking: the account and the roles it was granted. */
export interface AcknowledgementReader {
  appUserId: string;
  roles: readonly PolicyRole[];
}

export interface PendingPolicy {
  code: string;
  title: string;
  versionNumber: number;
}

/** The most policies the library holds: the set is fixed and small, so the whole of it is read at once. */
const WHOLE_LIBRARY = 100;

/**
 * What a reader owes the policies in force, from the versions and the acknowledgements: one statement for the versions and one for the
 * acknowledgements however many policies there are. The rule itself is `acknowledgementStateOf`.
 */
@Injectable()
export class AcknowledgementFactsService {
  constructor(
    private readonly library: LibraryRepo,
    private readonly acknowledgements: AcknowledgementRepo,
  ) {}

  /** The state of each of these policies for the reader; a policy with nothing in force is not owed. */
  async statesOf(
    reader: AcknowledgementReader,
    policies: readonly PolicyRecord[],
    tx?: DbTx,
  ): Promise<Map<string, MyAcknowledgement>> {
    const ids = policies.map((policy) => policy.id);
    // One statement after the other: a transaction client runs one query at a time.
    const facts = await this.library.versionFacts(ids, tx);
    const acknowledged = await this.acknowledgements.acknowledgedNumbers(reader.appUserId, ids, tx);
    const states = new Map<string, MyAcknowledgement>();
    for (const policy of policies) {
      states.set(
        policy.id,
        policy.current === null
          ? 'NOT_REQUIRED'
          : acknowledgementStateOf({
              roles: reader.roles,
              applicableRoles: policy.current.applicableRoles,
              versions: facts.filter((fact) => fact.policyId === policy.id),
              acknowledgedVersionNumbers: acknowledged.get(policy.id) ?? [],
            }),
      );
    }

    return states;
  }

  /** The policies in force the reader has to acknowledge, by code. */
  async pendingOf(organizationId: string, reader: AcknowledgementReader): Promise<PendingPolicy[]> {
    const { rows } = await this.library.policyPage(organizationId, 0, WHOLE_LIBRARY);
    const states = await this.statesOf(reader, rows);

    return rows.flatMap((policy) =>
      policy.current !== null && states.get(policy.id) === 'PENDING'
        ? [{ code: policy.code, title: policy.current.title, versionNumber: policy.current.versionNumber }]
        : [],
    );
  }
}
