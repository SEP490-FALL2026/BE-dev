import { declareTaxProfileBodySchema } from './vendor.dto';

describe('FIX-E-O2: the tax name of a profile line is counted the way the profile policy keeps it', () => {
  const body = (taxType: string) => ({ lines: [{ taxType, ratePercent: '10', deductible: true }] });
  const issuesOf = (taxType: string) => {
    const parsed = declareTaxProfileBodySchema.safeParse(body(taxType));

    return parsed.success ? [] : parsed.error.issues.map((issue) => ({ code: issue.code, path: issue.path.join('.') }));
  };

  it('takes a name of 100 characters, and refuses one of 101', () => {
    expect(issuesOf('T'.repeat(100))).toEqual([]);
    expect(issuesOf('T'.repeat(101))).toEqual([{ code: 'too_big', path: 'lines.0.taxType' }]);
  });

  it('takes a name of 100 characters once the ends are trimmed and the blanks collapsed, though it is longer as typed', () => {
    const typed = `  ${'T'.repeat(48)}     ${'U'.repeat(51)}  `; // 48 + 1 + 51 = 100 once kept

    expect(typed.length).toBeGreaterThan(100);
    expect(issuesOf(typed)).toEqual([]);
  });

  it('takes a name of 100 characters once the accents are composed (NFC), though it is longer in NFD', () => {
    const decomposed = 'Thuế'.normalize('NFD').repeat(25); // 25 x 4 = 100 composed, 150 decomposed

    expect(decomposed.length).toBeGreaterThan(100);
    expect(issuesOf(decomposed)).toEqual([]);
  });

  it('refuses a name of 101 characters once it is kept, however it is spaced or composed', () => {
    expect(issuesOf(`  ${'T'.repeat(50)}   ${'U'.repeat(50)}  `)).toEqual([
      { code: 'too_big', path: 'lines.0.taxType' },
    ]);
    expect(issuesOf('Thuế'.normalize('NFD').repeat(25) + 'x')).toEqual([{ code: 'too_big', path: 'lines.0.taxType' }]);
  });

  it('leaves the empty name to the policy, which answers it with VENDOR_TAX_PROFILE.TAX_TYPE_INVALID', () => {
    expect(issuesOf('   ')).toEqual([]);
  });
});
