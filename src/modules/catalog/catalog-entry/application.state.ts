import { isCommunicationService, type CommunicationAnswers } from './application.policy';
import type { ApplicationCommunication, ApplicationRecord } from './application.types';

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
