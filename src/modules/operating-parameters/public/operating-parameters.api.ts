import { Injectable } from '@nestjs/common';
import { cutHistory } from '../../../core/application/pagination';
import { BusinessDate } from '../../../core/business-date';
import { DbTx, TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../audit/public/audit.api';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { ParameterNotFoundError, ParameterValueInvalidError } from '../operating-parameters.errors';
import { OperatingParametersRepo } from '../operating-parameters.repo';
import {
  PARAMETER_DEFINITIONS,
  ParameterDefinition,
  ParameterValue,
  ParameterValues,
  defaultValues,
  definitionOf,
  validateParameterValue,
} from '../parameter-definitions.policy';

const HISTORY_LIMIT = 20;

export interface ParameterView {
  key: string;
  value: ParameterValue;
  default: ParameterValue;
  isDefault: boolean;
  unit: string;
  description: string;
  constraints: ParameterDefinition['shape'];
  /** When the current value took effect; null while the default stands. */
  changedAt: Date | null;
}

/** The effective value of a parameter: the one set by the Super Admin, or the default. */
function effective(rows: { key: string; value: ParameterValue }[]): ParameterValues {
  const values = defaultValues();
  for (const row of rows) if (definitionOf(row.key)) values[row.key] = row.value;

  return values;
}

/**
 * The operating parameters (`US-01-04`). Other modules read a value with `getValue` at the moment they create
 * what it governs, so a change applies to what is created after it and never to what already runs (AC-12, AC-13).
 * Only the Super Admin sets one; setting one is configuration, never an approval (`SoD-1`).
 */
@Injectable()
export class OperatingParametersApi {
  constructor(
    private readonly repo: OperatingParametersRepo,
    private readonly organizationReads: OrganizationReadApi,
    private readonly audit: AuditApi,
    private readonly runner: TransactionRunner,
  ) {}

  /** The value in force now: the stored one, or the default of the parameter. Throws ParameterNotFoundError for an unknown key. */
  async getValue(key: string): Promise<ParameterValue> {
    if (!definitionOf(key)) throw new ParameterNotFoundError(key);

    return effective(await this.repo.currentRows())[key];
  }

  /**
   * The value that was in force at `instant`: the row whose validity covers it, or the default of the parameter when none does.
   * What a story calls "the value when it was created" is read with this, so a later change never moves it (`US-01-04` AC-15).
   * Throws ParameterNotFoundError for an unknown key.
   */
  async getValueAt(key: string, instant: Date, tx?: DbTx): Promise<ParameterValue> {
    const definition = definitionOf(key);
    if (!definition) throw new ParameterNotFoundError(key);

    return (await this.repo.rowAt(key, instant, tx))?.value ?? definition.default;
  }

  /**
   * The value in force at each of the instants, in the order given, from one read: for a page of things that each remember the
   * moment they were made. An instant before any row, or between rows, is read as the default.
   */
  async getValuesAt(key: string, instants: readonly Date[], tx?: DbTx): Promise<ParameterValue[]> {
    const definition = definitionOf(key);
    if (!definition) throw new ParameterNotFoundError(key);
    if (instants.length === 0) return [];
    const times = instants.map((instant) => instant.getTime());
    const rows = await this.repo.rowsCovering(key, new Date(Math.min(...times)), new Date(Math.max(...times)), tx);

    return times.map((time) => {
      const row = [...rows]
        .reverse()
        .find(
          (candidate) =>
            candidate.validFrom.getTime() <= time && (!candidate.validTo || candidate.validTo.getTime() > time),
        );

      return row?.value ?? definition.default;
    });
  }

  /** The days nobody works from `from` to `to`, both included, for the working-day arithmetic of the workflows. */
  async getNonWorkingDates(from: BusinessDate, to: BusinessDate): Promise<Set<BusinessDate>> {
    return new Set((await this.repo.listNonWorkingDates({ from, to })).map((row) => row.date));
  }

  async list(): Promise<ParameterView[]> {
    const rows = await this.repo.currentRows();
    const stored = new Map(rows.map((row) => [row.key, row]));

    return PARAMETER_DEFINITIONS.map((definition) => {
      const row = stored.get(definition.key);

      return {
        key: definition.key,
        value: row ? row.value : definition.default,
        default: definition.default,
        isDefault: !row || JSON.stringify(row.value) === JSON.stringify(definition.default),
        unit: definition.unit,
        description: definition.description,
        constraints: definition.shape,
        changedAt: row ? row.validFrom : null,
      };
    });
  }

  /** The newest {@link HISTORY_LIMIT} values of a parameter, and whether there are older ones. */
  async history(
    key: string,
  ): Promise<{ items: { value: ParameterValue; from: Date; until: Date | null }[]; hasMore: boolean }> {
    if (!definitionOf(key)) throw new ParameterNotFoundError(key);
    const { items, hasMore } = cutHistory(await this.repo.history(key, HISTORY_LIMIT + 1), HISTORY_LIMIT);

    return { items: items.map((row) => ({ value: row.value, from: row.validFrom, until: row.validTo })), hasMore };
  }

  /**
   * Sets a parameter from now on (AC-12, AC-13). A value outside the domain, or one that would put two parameters
   * out of order, is refused and changes nothing (AC-3). The same value as now records nothing.
   */
  async set(actor: AuthenticatedPrincipal, key: string, value: unknown): Promise<ParameterView> {
    if (!definitionOf(key)) throw new ParameterNotFoundError(key);
    const organization = await this.organizationReads.getOrganization();
    if (!organization) throw new Error('The operating parameters were used before installation');

    await this.runner.run(async (tx) => {
      await this.repo.lockKey(tx, key);
      const current = effective(await this.repo.currentRows(tx));
      const verdict = validateParameterValue(key, value, current);
      if (!verdict.ok) {
        throw verdict.reason === 'UNKNOWN_KEY'
          ? new ParameterNotFoundError(key)
          : new ParameterValueInvalidError(key, verdict.reason);
      }
      const next = value as ParameterValue;
      if (JSON.stringify(current[key]) === JSON.stringify(next)) return;

      const now = new Date();
      await this.repo.replaceCurrent(tx, {
        organizationId: organization.id,
        key,
        value: next,
        changedBy: actor.appUserId,
        now,
      });
      await this.audit.record(tx, {
        organizationId: organization.id,
        actorKind: 'USER',
        actorAppUserId: actor.appUserId,
        actorRoles: actor.roles,
        action: 'PARAMETER.CHANGED',
        resourceType: 'OperatingParameter',
        resourceId: key,
        before: { value: current[key] },
        after: { value: next },
        correlationId: actor.sessionId,
      });
    });

    return (await this.list()).find((view) => view.key === key) as ParameterView;
  }

  /** The business date the organization is on now, for the non-working-date rules. */
  today(): Promise<BusinessDate> {
    return this.organizationReads.businessToday();
  }
}
