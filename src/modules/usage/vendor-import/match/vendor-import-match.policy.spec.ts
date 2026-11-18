import { aliasVariants, judgeIdentity, looksLikeEmail, type IdentifierFacts } from './vendor-import-match.policy';

const none: IdentifierFacts = { mapping: null, emailHits: [], accountHits: [], aliasHits: [] };

describe('FR-4.5, FR-4.6: judgeIdentity, in the order of the match', () => {
  it('step 1: the mapping in force wins over anything the other steps find', () => {
    expect(
      judgeIdentity({ ...none, mapping: { employeeId: 'E1', method: 'MANUAL' }, emailHits: ['E2'] }),
    ).toMatchObject({
      outcome: 'MATCHED',
      employeeId: 'E1',
      method: 'MANUAL',
    });
  });

  it('step 2: the work email exactly, or the account identifier of a seat, is EXACT_EMAIL or ACCOUNT_IDENTIFIER with high confidence', () => {
    expect(judgeIdentity({ ...none, emailHits: ['E1'] })).toMatchObject({ method: 'EXACT_EMAIL', confidence: 'HIGH' });
    expect(judgeIdentity({ ...none, accountHits: ['E1'] })).toMatchObject({
      method: 'ACCOUNT_IDENTIFIER',
      confidence: 'HIGH',
    });
    expect(judgeIdentity({ ...none, emailHits: ['E1'], accountHits: ['E1'] })).toMatchObject({
      outcome: 'MATCHED',
      method: 'EXACT_EMAIL',
    });
  });

  it('step 3: the rule of aliases is ALIAS_RULE with medium confidence, and only when the exact steps found nobody', () => {
    expect(judgeIdentity({ ...none, aliasHits: ['E1'] })).toMatchObject({ method: 'ALIAS_RULE', confidence: 'MEDIUM' });
    expect(judgeIdentity({ ...none, emailHits: ['E2'], aliasHits: ['E1'] })).toMatchObject({ employeeId: 'E2' });
  });

  it('INV-12: one identifier that fits two people is ambiguous with both as candidates, never a guess', () => {
    expect(judgeIdentity({ ...none, emailHits: ['E1'], accountHits: ['E2'] })).toEqual({
      outcome: 'AMBIGUOUS',
      employeeId: null,
      method: null,
      confidence: null,
      candidates: ['E1', 'E2'],
    });
    expect(judgeIdentity({ ...none, aliasHits: ['E2', 'E1'] })).toMatchObject({
      outcome: 'AMBIGUOUS',
      candidates: ['E1', 'E2'],
    });
  });

  it('nobody is not found', () => {
    expect(judgeIdentity(none)).toMatchObject({ outcome: 'UNMATCHED', employeeId: null });
  });
});

describe('M5-07 (FR-4.6, INV-12): an identifier whose mapping the IT Admin ended', () => {
  it('is never tied again by the exact steps or the aliases: it waits in the queue', () => {
    expect(judgeIdentity({ ...none, mappingEnded: true, emailHits: ['E1'], aliasHits: ['E1'] })).toMatchObject({
      outcome: 'UNMATCHED',
      employeeId: null,
    });
  });

  it('is tied by a mapping made by hand since', () => {
    expect(
      judgeIdentity({
        ...none,
        mappingEnded: true,
        mapping: { employeeId: 'E2', method: 'MANUAL' },
        emailHits: ['E1'],
      }),
    ).toMatchObject({ outcome: 'MATCHED', employeeId: 'E2', method: 'MANUAL' });
  });
});

describe('aliasVariants', () => {
  it('drops the +tag of the local part and tries the other domains of the company from a domain of the company', () => {
    expect(aliasVariants('baovh+figma@old.com', ['acme.vn', 'old.com'])).toEqual(['baovh@acme.vn', 'baovh@old.com']);
    expect(aliasVariants('baovh@old.com', ['acme.vn', 'old.com'])).toEqual(['baovh@acme.vn']);
  });

  it('M5-06 (FR-4.5, TC-2): never ties an address outside the company to a person of the company by its local part', () => {
    expect(aliasVariants('nam.nv@gmail.com', ['company.com'])).toEqual([]);
    expect(aliasVariants('nam.nv+x@gmail.com', ['company.com'])).toEqual(['nam.nv@gmail.com']);
  });

  it('M5-06: a public mail domain is never a domain of the company, even when someone works with an address on it', () => {
    expect(aliasVariants('nam.nv@gmail.com', ['company.com', 'gmail.com'])).toEqual([]);
    expect(aliasVariants('nam.nv@company.com', ['company.com', 'gmail.com'])).toEqual([]);
  });

  it('gives nothing for what is not an email, and never the identifier itself', () => {
    expect(aliasVariants('baovh', ['acme.vn'])).toEqual([]);
    expect(aliasVariants('baovh@acme.vn', ['acme.vn'])).toEqual([]);
    expect(looksLikeEmail('a@x.com')).toBe(true);
    expect(looksLikeEmail('a@b@c.com')).toBe(false);
  });
});
