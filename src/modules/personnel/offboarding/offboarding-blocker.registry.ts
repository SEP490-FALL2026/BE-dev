import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';

/**
 * What a flow that comes after the record of a departure tells it: how many things of its own still wait on a person who has left.
 * A blocker keeps the case from closing (the service accounts nobody answers for yet, the workspaces whose owner has not been
 * changed); a warning only shows beside the case and never stops anything (the roles the person holds that someone must take over).
 * The count is read when the case is shown or closed, in the caller's transaction when there is one.
 */
export interface OffboardingSource {
  /** A finite code the wire names; it is the key of the count in `blockers` or `warnings.registered`. */
  readonly code: string;
  countFor(employeeId: string, tx?: DbTx): Promise<number>;
}

/** The sources the later items of the context register when their module starts; none at the start. */
@Injectable()
export class OffboardingBlockerRegistry {
  private readonly blockerSources: OffboardingSource[] = [];
  private readonly warningSources: OffboardingSource[] = [];

  registerBlocker(source: OffboardingSource): void {
    this.add(this.blockerSources, source);
  }

  registerWarning(source: OffboardingSource): void {
    this.add(this.warningSources, source);
  }

  blockersOf(employeeId: string, tx?: DbTx): Promise<Record<string, number>> {
    return this.countAll(this.blockerSources, employeeId, tx);
  }

  warningsOf(employeeId: string, tx?: DbTx): Promise<Record<string, number>> {
    return this.countAll(this.warningSources, employeeId, tx);
  }

  private add(into: OffboardingSource[], source: OffboardingSource): void {
    if (into.some((known) => known.code === source.code))
      throw new Error(`An offboarding source ${source.code} is already registered`);
    into.push(source);
  }

  private async countAll(
    sources: readonly OffboardingSource[],
    employeeId: string,
    tx?: DbTx,
  ): Promise<Record<string, number>> {
    const counted: Record<string, number> = {};
    for (const source of sources) counted[source.code] = await source.countFor(employeeId, tx);

    return counted;
  }
}
