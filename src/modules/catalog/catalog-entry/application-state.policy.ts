import { isCommunicationService, type CommunicationAnswers } from './application.policy';
import type {
  ApplicationChanges,
  ApplicationCommunication,
  ApplicationRecord,
  DataSensitivity,
} from './application.types';

export const snapshot = (application: ApplicationRecord) => ({
  name: application.name,
  kind: application.kind,
  vendorId: application.vendor?.id ?? null,
  dictionaryServiceLineId: application.dictionaryServiceLineId,
  domains: application.domains,
  dataSensitivity: application.dataSensitivity,
  businessOwnerEmployeeId: application.businessOwnerEmployeeId,
  functionalGroupId: application.functionalGroup?.id ?? null,
  personToPersonMessaging: application.communication.personToPersonMessaging,
  callsOrMeetings: application.communication.callsOrMeetings,
  mailbox: application.communication.mailbox,
  isCommunicationService: application.communication.isCommunicationService,
  communicationNote: application.communication.note,
  status: application.status,
});

export const sameList = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every((value, index) => value === b[index]);

export function mergeCommunication(
  current: ApplicationCommunication,
  change: Partial<CommunicationAnswers> & { note?: string | null },
  note: string | null | undefined,
): ApplicationCommunication {
  const answers = {
    personToPersonMessaging: change.personToPersonMessaging ?? current.personToPersonMessaging,
    callsOrMeetings: change.callsOrMeetings ?? current.callsOrMeetings,
    mailbox: change.mailbox ?? current.mailbox,
  };

  return {
    ...answers,
    isCommunicationService: isCommunicationService(answers),
    note: note === undefined ? current.note : note,
  };
}

export function sameCommunication(a: ApplicationCommunication, b: ApplicationCommunication): boolean {
  return (
    a.personToPersonMessaging === b.personToPersonMessaging &&
    a.callsOrMeetings === b.callsOrMeetings &&
    a.mailbox === b.mailbox &&
    a.note === b.note
  );
}

/**
 * What an update of an application changes (`US-04-01`, `US-04-02`): each field the update gives that differs from what the application has.
 * `cleaned` is what the name, the domains and the note became once cleaned. Nothing is checked here: the references (the Business Owner,
 * the functional group, the dictionary line) are judged by the caller, in that order, for the ones that changed.
 */
export function applicationChangesOf(
  current: Pick<
    ApplicationRecord,
    'name' | 'domains' | 'dataSensitivity' | 'businessOwnerEmployeeId' | 'dictionaryServiceLineId' | 'communication'
  > & { functionalGroup: { id: string } | null },
  input: {
    dataSensitivity?: DataSensitivity;
    businessOwnerEmployeeId?: string;
    functionalGroupId?: string | null;
    dictionaryServiceLineId?: string | null;
    communication?: Partial<CommunicationAnswers> & { note?: string | null };
  },
  cleaned: { name?: string; domains?: string[]; note?: string | null },
): ApplicationChanges {
  return {
    ...scalarChangesOf(current, input, cleaned),
    ...referenceChangesOf(current, input),
    ...communicationChangeOf(current, input, cleaned.note),
  };
}

/** The name, the domains and the sensitivity of the data. */
function scalarChangesOf(
  current: Pick<ApplicationRecord, 'name' | 'domains' | 'dataSensitivity'>,
  input: { dataSensitivity?: DataSensitivity },
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

/** The Business Owner, the functional group and the dictionary line: what the application refers to. */
function referenceChangesOf(
  current: Pick<ApplicationRecord, 'businessOwnerEmployeeId' | 'dictionaryServiceLineId'> & {
    functionalGroup: { id: string } | null;
  },
  input: {
    businessOwnerEmployeeId?: string;
    functionalGroupId?: string | null;
    dictionaryServiceLineId?: string | null;
  },
): ApplicationChanges {
  const changes: ApplicationChanges = {};
  if (
    input.businessOwnerEmployeeId !== undefined &&
    input.businessOwnerEmployeeId !== current.businessOwnerEmployeeId
  ) {
    changes.businessOwnerEmployeeId = input.businessOwnerEmployeeId;
  }
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

/** The answers about communication and the note, merged with what the application has, when they differ. */
function communicationChangeOf(
  current: Pick<ApplicationRecord, 'communication'>,
  input: { communication?: Partial<CommunicationAnswers> & { note?: string | null } },
  note: string | null | undefined,
): ApplicationChanges {
  if (input.communication === undefined) return {};
  const merged = mergeCommunication(current.communication, input.communication, note);

  return sameCommunication(merged, current.communication) ? {} : { communication: merged };
}
