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
