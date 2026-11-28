import { ProvisioningEvidenceFileInvalidError } from '../provisioning.errors';
import { assertEvidenceFileList } from './provisioning-evidence-files.policy';

describe('evidence file lists', () => {
  it.each([undefined, []])('takes an omitted or empty list (%j)', (ids) =>
    expect(assertEvidenceFileList(ids)).toEqual([]),
  );
  it('returns sorted ids without changing the input', () => {
    const ids = ['c', 'a', 'b'];
    expect(assertEvidenceFileList(ids)).toEqual(['a', 'b', 'c']);
    expect(ids).toEqual(['c', 'a', 'b']);
  });
  it('sorts UUID identities in one canonical order regardless of letter case', () => {
    const lower = 'a0000000-0000-4000-8000-000000000001';
    const upper = 'B0000000-0000-4000-8000-000000000002';
    expect(assertEvidenceFileList([upper, lower])).toEqual([lower, upper.toLowerCase()]);
  });
  it('rejects two spellings of the same UUID as DUPLICATE before any attachment', () => {
    const id = 'a0000000-0000-4000-8000-000000000001';
    let refusal: unknown;
    try {
      assertEvidenceFileList([id, id.toUpperCase()]);
    } catch (error) {
      refusal = error;
    }
    expect(refusal).toBeInstanceOf(ProvisioningEvidenceFileInvalidError);
    expect(refusal).toMatchObject({ problem: 'DUPLICATE' });
  });
  it.each([
    [['a', 'b', 'c', 'd'], 'TOO_MANY'],
    [['a', 'a'], 'DUPLICATE'],
  ] as const)('refuses %j with %s', (ids, problem) => {
    let refusal: unknown;
    try {
      assertEvidenceFileList(ids);
    } catch (error) {
      refusal = error;
    }
    expect(refusal).toBeInstanceOf(ProvisioningEvidenceFileInvalidError);
    expect(refusal).toMatchObject({ problem });
  });
});
