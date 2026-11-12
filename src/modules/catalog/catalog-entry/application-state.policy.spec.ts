import { applicationChangesOf } from './application-state.policy';

const communication = {
  personToPersonMessaging: false,
  callsOrMeetings: false,
  mailbox: false,
  isCommunicationService: false,
  note: null as string | null,
};
const current = {
  name: 'Slack',
  domains: ['slack.com'],
  dataSensitivity: 'MEDIUM' as const,
  functionalGroup: { id: 'grp-1' } as { id: string } | null,
  dictionaryServiceLineId: 'line-1' as string | null,
  communication,
};

describe('what an update of an application changes (US-04-01, US-04-02)', () => {
  it('changes nothing when the update gives nothing, or gives what the application already has', () => {
    expect(applicationChangesOf(current, {}, {})).toEqual({});
    expect(
      applicationChangesOf(
        current,
        {
          dataSensitivity: 'MEDIUM',
          functionalGroupId: 'grp-1',
          dictionaryServiceLineId: 'line-1',
        },
        { name: 'Slack', domains: ['slack.com'] },
      ),
    ).toEqual({});
  });

  it('notes every field that differs, and nothing else', () => {
    expect(
      applicationChangesOf(
        current,
        {
          dataSensitivity: 'HIGH',
          functionalGroupId: 'grp-2',
          dictionaryServiceLineId: 'line-2',
        },
        { name: 'Slack Pro', domains: ['slack.com', 'slack-edge.com'] },
      ),
    ).toEqual({
      name: 'Slack Pro',
      domains: ['slack.com', 'slack-edge.com'],
      dataSensitivity: 'HIGH',
      functionalGroupId: 'grp-2',
      dictionaryServiceLineId: 'line-2',
    });
  });

  it('clears the functional group or the dictionary line when the update says null and there is one', () => {
    expect(applicationChangesOf(current, { functionalGroupId: null, dictionaryServiceLineId: null }, {})).toEqual({
      functionalGroupId: null,
      dictionaryServiceLineId: null,
    });
    expect(
      applicationChangesOf(
        { ...current, functionalGroup: null, dictionaryServiceLineId: null },
        { functionalGroupId: null, dictionaryServiceLineId: null },
        {},
      ),
    ).toEqual({});
  });

  it('merges the answers about communication and the note, and notes them only when they differ', () => {
    expect(applicationChangesOf(current, { communication: { mailbox: true } }, {})).toEqual({
      communication: { ...communication, mailbox: true, isCommunicationService: true },
    });
    expect(applicationChangesOf(current, { communication: { mailbox: false } }, {})).toEqual({});
    expect(applicationChangesOf(current, { communication: {} }, { note: 'ghi chú' })).toEqual({
      communication: { ...communication, note: 'ghi chú' },
    });
  });
});
