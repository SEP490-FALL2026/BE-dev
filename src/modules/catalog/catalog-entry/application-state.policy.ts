import type { ApplicationChanges, ApplicationRecord, DataSensitivity } from './application.types';

export const snapshot = (application: ApplicationRecord) => ({
  name: application.name,
  kind: application.kind,
  vendorId: application.vendor?.id ?? null,
  dictionaryServiceLineId: application.dictionaryServiceLineId,
  domains: application.domains,
  dataSensitivity: application.dataSensitivity,
  responsibleItAdminEmployeeId: application.responsibleItAdminEmployeeId,
  functionalGroupId: application.functionalGroup?.id ?? null,
  status: application.status,
});

export const sameList = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every((value, index) => value === b[index]);

/**
 * What an update of an application changes (`US-04-01`, `US-04-02`): each field the update gives that differs from what the application has.
 * `cleaned` is what the name and the domains became once cleaned. Nothing is checked here: the references (the functional group,
 * the dictionary line) are judged by the caller, in that order, for the ones that changed.
 */
export function applicationChangesOf(
  current: Pick<ApplicationRecord, 'name' | 'domains' | 'dataSensitivity' | 'dictionaryServiceLineId'> & {
    functionalGroup: { id: string } | null;
  },
  input: {
    dataSensitivity?: DataSensitivity | null;
    functionalGroupId?: string;
    dictionaryServiceLineId?: string | null;
  },
  cleaned: { name?: string; domains?: string[] },
): ApplicationChanges {
  return {
    ...scalarChangesOf(current, input, cleaned),
    ...referenceChangesOf(current, input),
  };
}

/** The name, the domains and the sensitivity of the data (null says it is not rated). */
function scalarChangesOf(
  current: Pick<ApplicationRecord, 'name' | 'domains' | 'dataSensitivity'>,
  input: { dataSensitivity?: DataSensitivity | null },
  cleaned: { name?: string; domains?: string[] },
): ApplicationChanges {
  const changes: ApplicationChanges = {};
  if (cleaned.name !== undefined && cleaned.name !== current.name) changes.name = cleaned.name;
  if (cleaned.domains !== undefined && !sameList(cleaned.domains, current.domains)) changes.domains = cleaned.domains;
  if (input.dataSensitivity !== undefined && input.dataSensitivity !== current.dataSensitivity) {
    changes.dataSensitivity = input.dataSensitivity;
  }

  return changes;
}

/** The functional group and the dictionary line: what the application refers to. */
function referenceChangesOf(
  current: Pick<ApplicationRecord, 'dictionaryServiceLineId'> & {
    functionalGroup: { id: string } | null;
  },
  input: {
    functionalGroupId?: string;
    dictionaryServiceLineId?: string | null;
  },
): ApplicationChanges {
  const changes: ApplicationChanges = {};
  if (input.functionalGroupId !== undefined && input.functionalGroupId !== (current.functionalGroup?.id ?? null)) {
    changes.functionalGroupId = input.functionalGroupId;
  }
  if (
    input.dictionaryServiceLineId !== undefined &&
    input.dictionaryServiceLineId !== current.dictionaryServiceLineId
  ) {
    changes.dictionaryServiceLineId = input.dictionaryServiceLineId;
  }

  return changes;
}
