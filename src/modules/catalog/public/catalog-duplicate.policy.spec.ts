import { duplicateOf, type CatalogEntryFacts } from './catalog-duplicate.policy';

const figma: CatalogEntryFacts = { id: 'a-figma', name: 'Figma', domains: ['figma.com'] };
const claude: CatalogEntryFacts = { id: 'a-claude', name: 'Claude', domains: ['claude.ai', 'anthropic.com'] };
const chat: CatalogEntryFacts = { id: 'a-chat', name: 'Chat GPT', domains: [] };
const entries = [chat, claude, figma];

describe('duplicateOf (QĐ-111b: the same name or the same domain is the same software)', () => {
  it('finds an entry by its name once case, accents and spacing are ignored', () => {
    expect(duplicateOf({ name: '  fígma ', domains: [] }, entries)).toEqual({ entry: figma, by: 'NAME' });
    expect(duplicateOf({ name: 'CHAT   gpt', domains: [] }, entries)).toEqual({ entry: chat, by: 'NAME' });
  });

  it('finds an entry by a domain the candidate shares, the name being different', () => {
    expect(duplicateOf({ name: 'Claude AI', domains: ['claude.ai'] }, entries)).toEqual({
      entry: claude,
      by: 'DOMAIN',
    });
    expect(duplicateOf({ name: 'Anything', domains: ['example.org', 'anthropic.com'] }, entries)).toEqual({
      entry: claude,
      by: 'DOMAIN',
    });
  });

  it('says NAME when both the name and a domain match: the name is the first thing a person typed', () => {
    expect(duplicateOf({ name: 'Figma', domains: ['figma.com'] }, entries)).toEqual({ entry: figma, by: 'NAME' });
  });

  it('is not fooled by a name that only contains another, or a domain that only ends like another', () => {
    expect(duplicateOf({ name: 'Figma Jam', domains: ['notfigma.com'] }, entries)).toBeNull();
    expect(duplicateOf({ name: 'Claude', domains: [] }, [{ ...claude, name: 'Claude Code' }])).toBeNull();
    expect(duplicateOf({ name: 'App', domains: ['app.figma.com'] }, entries)).toBeNull();
  });

  it('finds nothing in an empty catalog or when the candidate gives no domain and a new name', () => {
    expect(duplicateOf({ name: 'Figma', domains: ['figma.com'] }, [])).toBeNull();
    expect(duplicateOf({ name: 'Notion', domains: [] }, entries)).toBeNull();
  });

  it('answers the first entry in the order given when several match', () => {
    const twin: CatalogEntryFacts = { id: 'a-figma-2', name: 'Figma 2', domains: ['figma.com'] };

    expect(duplicateOf({ name: 'Other', domains: ['figma.com'] }, [twin, figma])).toEqual({
      entry: twin,
      by: 'DOMAIN',
    });
  });
});
