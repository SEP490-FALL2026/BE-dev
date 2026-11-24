import { acknowledgementBlock, acknowledgementStateOf, type AcknowledgementFacts } from './acknowledgement.policy';

const ready: AcknowledgementFacts = {
  registrationEnded: false,
  collectorInstalled: true,
  signatureRecorded: true,
  currentNoticeId: 'v2',
  offeredNoticeId: 'v2',
  alreadyActive: false,
};

describe('acknowledgementBlock', () => {
  it('lets the holder acknowledge a signed registration under the notice in force', () => {
    expect(acknowledgementBlock(ready)).toBeNull();
  });

  it('names the first thing in the way, in the order the holder fixes them', () => {
    expect(
      acknowledgementBlock({ ...ready, registrationEnded: true, collectorInstalled: false, signatureRecorded: false }),
    ).toBe('REGISTRATION_ENDED');
    expect(acknowledgementBlock({ ...ready, collectorInstalled: false, signatureRecorded: false })).toBe(
      'COLLECTOR_NOT_INSTALLED',
    );
    expect(acknowledgementBlock({ ...ready, signatureRecorded: false, currentNoticeId: null })).toBe(
      'SIGNATURE_RECORD_MISSING',
    );
    expect(acknowledgementBlock({ ...ready, currentNoticeId: null, offeredNoticeId: null })).toBe(
      'NOTICE_NOT_PUBLISHED',
    );
    expect(acknowledgementBlock({ ...ready, offeredNoticeId: 'v1', alreadyActive: true })).toBe('NOTICE_NOT_CURRENT');
    expect(acknowledgementBlock({ ...ready, alreadyActive: true })).toBe('ALREADY_ACKNOWLEDGED');
  });

  it('does not compare a version when the holder only asks whether they can', () => {
    expect(acknowledgementBlock({ ...ready, offeredNoticeId: null })).toBeNull();
  });
});

describe('acknowledgementStateOf', () => {
  const at = new Date('2026-11-05T00:00:00.000Z');

  it('reads the registration the way the holder sees it', () => {
    expect(
      acknowledgementStateOf({
        endedAt: at,
        collectorInstalled: false,
        collectionStoppedAt: null,
        acknowledgedFrom: at,
      }),
    ).toBe('ENDED');
    expect(
      acknowledgementStateOf({
        endedAt: null,
        collectorInstalled: false,
        collectionStoppedAt: null,
        acknowledgedFrom: null,
      }),
    ).toBe('NOT_REQUIRED');
    expect(
      acknowledgementStateOf({
        endedAt: null,
        collectorInstalled: true,
        collectionStoppedAt: at,
        acknowledgedFrom: null,
      }),
    ).toBe('STOPPED');
    expect(
      acknowledgementStateOf({
        endedAt: null,
        collectorInstalled: true,
        collectionStoppedAt: null,
        acknowledgedFrom: at,
      }),
    ).toBe('ACKNOWLEDGED');
    expect(
      acknowledgementStateOf({
        endedAt: null,
        collectorInstalled: true,
        collectionStoppedAt: null,
        acknowledgedFrom: null,
      }),
    ).toBe('UNACKNOWLEDGED');
  });
});
