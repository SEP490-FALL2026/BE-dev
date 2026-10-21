import {
  ApplicationDomainInvalidError,
  ApplicationInternalHasNoVendorError,
  ApplicationKindNotManagedError,
  ApplicationNameInvalidError,
  ApplicationNoteInvalidError,
  ApplicationTooManyDomainsError,
  ApplicationVendorNameInvalidError,
  ApplicationVendorRequiredError,
  ApplicationVendorSourceAmbiguousError,
} from './application.errors';
import {
  cleanApplicationDomains,
  cleanApplicationName,
  cleanNote,
  isCommunicationService,
  replacementRequired,
  usageCollectionDefault,
  vendorSourceOf,
} from './application.policy';

const LINE = '3f0c7d54-9e1b-4f6a-8d2c-5b7a1e9c0d11';

describe('isCommunicationService (ADR-10: any "yes" of the three questions)', () => {
  it.each([
    [false, false, false, false],
    [true, false, false, true],
    [false, true, false, true],
    [false, false, true, true],
    [true, true, true, true],
  ])('%s, %s, %s => %s', (messaging, calls, mailbox, flag) => {
    expect(isCommunicationService({ personToPersonMessaging: messaging, callsOrMeetings: calls, mailbox })).toBe(flag);
  });
});

describe('usageCollectionDefault (BR-06.2)', () => {
  it('is NOT_COLLECTED for a communication service and unset otherwise', () => {
    expect(usageCollectionDefault(true)).toBe('NOT_COLLECTED');
    expect(usageCollectionDefault(false)).toBeNull();
  });
});

describe('cleanApplicationName', () => {
  it('keeps the case and accents, trims and collapses blanks', () => {
    expect(cleanApplicationName('  Cổng   báo cáo \t nội bộ ')).toBe('Cổng báo cáo nội bộ');
  });

  it.each([[''], ['   '], ['N'.repeat(201)]])('refuses %j', (name) => {
    expect(() => cleanApplicationName(name)).toThrow(ApplicationNameInvalidError);
  });
});

describe('cleanApplicationDomains', () => {
  it('reduces to hosts, drops repeats, keeps the order', () => {
    expect(cleanApplicationDomains(['WWW.Figma.com', 'https://figma.com/files', 'sketch.com'])).toEqual([
      'figma.com',
      'sketch.com',
    ]);
  });

  it('refuses a value that is not a host and more than twenty domains', () => {
    expect(() => cleanApplicationDomains(['not a host'])).toThrow(ApplicationDomainInvalidError);
    expect(() => cleanApplicationDomains(Array.from({ length: 21 }, (_, index) => `d${index}.example.com`))).toThrow(
      ApplicationTooManyDomainsError,
    );
  });
});

describe('cleanNote', () => {
  it('is null for nothing or blanks, trimmed text otherwise, and refuses more than 1000 characters', () => {
    expect(cleanNote(undefined)).toBeNull();
    expect(cleanNote(null)).toBeNull();
    expect(cleanNote('   ')).toBeNull();
    expect(cleanNote('  có bình luận   trên ticket ')).toBe('có bình luận trên ticket');
    expect(cleanNote('n'.repeat(1000))).toHaveLength(1000);
    expect(() => cleanNote('n'.repeat(1001))).toThrow(ApplicationNoteInvalidError);
  });
});

describe('vendorSourceOf', () => {
  it('refuses the free external software, which is not a managed object (QĐ-49a)', () => {
    expect(() => vendorSourceOf({ kind: 'FREE_EXTERNAL', vendorName: 'Canva' })).toThrow(
      ApplicationKindNotManagedError,
    );
  });

  it('gives an internal application no vendor at all (AC-10)', () => {
    expect(vendorSourceOf({ kind: 'INTERNAL' })).toEqual({ type: 'NONE' });
    expect(() => vendorSourceOf({ kind: 'INTERNAL', vendorName: 'Acme' })).toThrow(ApplicationInternalHasNoVendorError);
    expect(() => vendorSourceOf({ kind: 'INTERNAL', dictionaryServiceLineId: LINE })).toThrow(
      ApplicationInternalHasNoVendorError,
    );
  });

  it('takes the vendor of a SaaS or licensed application from the dictionary line or from a typed name, not both, not neither', () => {
    expect(vendorSourceOf({ kind: 'SAAS', dictionaryServiceLineId: LINE })).toEqual({
      type: 'DICTIONARY',
      lineId: LINE,
    });
    expect(vendorSourceOf({ kind: 'LICENSED', vendorName: '  Microsoft   Corp ' })).toEqual({
      type: 'NAME',
      name: 'Microsoft Corp',
    });
    expect(() => vendorSourceOf({ kind: 'SAAS' })).toThrow(ApplicationVendorRequiredError);
    expect(() => vendorSourceOf({ kind: 'SAAS', vendorName: 'Figma', dictionaryServiceLineId: LINE })).toThrow(
      ApplicationVendorSourceAmbiguousError,
    );
  });

  it('refuses a typed vendor name that is empty or over 200 characters', () => {
    expect(() => vendorSourceOf({ kind: 'SAAS', vendorName: '   ' })).toThrow(ApplicationVendorNameInvalidError);
    expect(() => vendorSourceOf({ kind: 'SAAS', vendorName: 'V'.repeat(201) })).toThrow(
      ApplicationVendorNameInvalidError,
    );
  });
});

describe('replacementRequired (US-04-06: the flag is read from the status, never stored)', () => {
  it('AC-1, AC-2: a Business Owner who has left needs replacing', () => {
    expect(replacementRequired('TERMINATED')).toBe(true);
  });

  it('AC-6: one who is still working does not, whatever department they moved to', () => {
    expect(replacementRequired('ACTIVE')).toBe(false);
  });
});
