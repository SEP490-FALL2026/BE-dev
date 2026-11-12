import {
  ApplicationDomainInvalidError,
  ApplicationInternalHasNoVendorError,
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
  needsResponsible,
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

describe('needsResponsible (QĐ-111g, US-04-06: the flag is read from the account, never stored)', () => {
  const usable = new Set(['it-1', 'it-2']);

  it('is true when nobody is responsible', () => {
    expect(needsResponsible(null, usable)).toBe(true);
  });

  it('is true when the responsible person is no longer a usable IT Admin (left, locked, lost the role)', () => {
    expect(needsResponsible('gone', usable)).toBe(true);
    expect(needsResponsible('it-1', new Set())).toBe(true);
  });

  it('is false while the responsible person is a usable IT Admin', () => {
    expect(needsResponsible('it-2', usable)).toBe(false);
  });
});
