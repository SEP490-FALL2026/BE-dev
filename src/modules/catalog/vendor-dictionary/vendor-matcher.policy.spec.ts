import {
  matchDescription,
  matchDomain,
  matchName,
  normalizeHost,
  searchKey,
  type MatchableLine,
} from './vendor-matcher.policy';

const line = (
  partial: Partial<MatchableLine> & Pick<MatchableLine, 'lineId' | 'lineName' | 'groupName'>,
): MatchableLine => ({
  groupId: `g-${partial.groupName}`,
  domains: [],
  patterns: [],
  groupDomains: [],
  ...partial,
});

const FIGMA = line({ lineId: 'l-figma', lineName: 'Figma', groupName: 'Figma', domains: ['figma.com'] });
const CANVA = line({
  lineId: 'l-canva',
  lineName: 'Canva',
  groupName: 'Canva',
  domains: ['canva.com'],
  patterns: ['PAYPAL*CANVA'],
});
const M365 = line({
  lineId: 'l-m365',
  lineName: 'Microsoft 365',
  groupName: 'Microsoft',
  domains: ['office.com'],
  groupDomains: ['microsoft.com'],
});
const AZURE = line({
  lineId: 'l-azure',
  lineName: 'Azure',
  groupName: 'Microsoft',
  domains: ['azure.com'],
  groupDomains: ['microsoft.com'],
});
const ALL = [FIGMA, CANVA, M365, AZURE];

describe('searchKey', () => {
  it('ignores case, accents and surrounding or repeated blanks', () => {
    expect(searchKey('  Fígma   FIGJAM ')).toBe('figma figjam');
    expect(searchKey('Thiết  Kế')).toBe('thiet ke');
  });
});

describe('normalizeHost', () => {
  it.each([
    ['figma.com', 'figma.com'],
    ['www.figma.com', 'figma.com'],
    ['WWW.Figma.COM', 'figma.com'],
    ['  https://www.figma.com/files/team?x=1#top ', 'figma.com'],
    ['http://user:pw@app.figma.com:8443/path', 'app.figma.com'],
    ['figma.com:443', 'figma.com'],
  ])('reads the host of %j as %j', (input, host) => {
    expect(normalizeHost(input)).toBe(host);
  });

  it.each(['', 'figma', 'a b.com', '-figma.com', 'figma-.com', 'figma..com', 'figma.c_m', 'PAYPAL*CANVA 123'])(
    'finds no host in %j',
    (input) => {
      expect(normalizeHost(input)).toBeNull();
    },
  );
});

describe('matchDomain', () => {
  it('AC-2: a www host matches the line that holds the domain', () => {
    expect(matchDomain('www.figma.com', ALL)).toEqual([FIGMA]);
  });

  it('matches a subdomain of a line domain, but never a longer label that merely ends the same way', () => {
    expect(matchDomain('app.figma.com', ALL)).toEqual([FIGMA]);
    expect(matchDomain('notfigma.com', ALL)).toEqual([]);
  });

  it('falls back to the brand domain of a group and then offers every line of that group', () => {
    expect(matchDomain('www.microsoft.com', ALL)).toEqual([M365, AZURE]);
  });

  it('prefers a line domain over the brand domain', () => {
    expect(matchDomain('portal.azure.com', ALL)).toEqual([AZURE]);
  });

  it('finds nothing for text that is not a host or a host nobody holds', () => {
    expect(matchDomain('PAYPAL*CANVA 123', ALL)).toEqual([]);
    expect(matchDomain('unknown.example', ALL)).toEqual([]);
  });
});

describe('matchDescription', () => {
  it('AC-3: a bank description containing a pattern matches that line, ignoring case and spacing', () => {
    expect(matchDescription('PAYPAL*CANVA 123', ALL)).toEqual([CANVA]);
    expect(matchDescription('  paypal*canva   987654 ', ALL)).toEqual([CANVA]);
  });

  it('reads a pattern literally: * is a character, not a wildcard, and nothing is a regular expression', () => {
    const regexLike = line({ lineId: 'l-x', lineName: 'X', groupName: 'X', patterns: ['A.*B'] });

    expect(matchDescription('A.*B 1', [regexLike])).toEqual([regexLike]);
    expect(matchDescription('AXXB 1', [regexLike])).toEqual([]);
  });

  it('lets the longest matching pattern win, and keeps every line that ties', () => {
    const generic = line({ lineId: 'l-pay', lineName: 'Pay', groupName: 'Pay', patterns: ['PAYPAL'] });
    const tieA = line({ lineId: 'l-ta', lineName: 'TA', groupName: 'TA', patterns: ['STRIPE*ACME'] });
    const tieB = line({ lineId: 'l-tb', lineName: 'TB', groupName: 'TB', patterns: ['STRIPE*ACME'] });

    expect(matchDescription('PAYPAL*CANVA 123', [generic, CANVA])).toEqual([CANVA]);
    expect(matchDescription('STRIPE*ACME', [tieA, tieB])).toEqual([tieA, tieB]);
  });

  it('finds nothing when no pattern occurs', () => {
    expect(matchDescription('GITHUB INC', ALL)).toEqual([]);
  });
});

describe('matchName', () => {
  it('AC-1: a name finds the line, by line name or group name', () => {
    expect(matchName('figma', ALL)).toEqual([FIGMA]);
    expect(matchName('  FIGMA ', ALL)).toEqual([FIGMA]);
  });

  it('AC-5: a name that is a group of several lines offers every line and chooses none', () => {
    expect(matchName('Microsoft', ALL)).toEqual([AZURE, M365]);
  });

  it('puts an exact line name first', () => {
    expect(matchName('azure', ALL)).toEqual([AZURE]);
    expect(matchName('microsoft 365', ALL)).toEqual([M365]);
  });

  it('refuses a query too short to mean anything, and finds nothing for an unknown name', () => {
    expect(matchName('a', ALL)).toEqual([]);
    expect(matchName('', ALL)).toEqual([]);
    expect(matchName('zzzz', ALL)).toEqual([]);
  });
});
