import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { VendorDirectoryService } from './vendor-directory.service';
import { VendorDictionaryGroupChangedError, VendorNameHeldByAnotherGroupError } from './vendor.errors';
import type { VendorRepo, VendorRow } from './vendor.repo';

const TX = {} as DbTx;
const ORGANIZATION = 'organization-1';
const GROUP = { id: 'group-acme', name: 'Acme' };
const vendor = (id: string, dictionaryGroupId: string | null): VendorRow => ({ id, name: 'Acme', dictionaryGroupId });

/** A repository where the vendor holding the group is never found and the insert always meets an existing row. */
function directoryWith(sameName: VendorRow | null, adopted: { vendor: VendorRow; adopted: boolean } | null) {
  const vendors = {
    findByDictionaryGroup: jest.fn().mockResolvedValue(null),
    insertIfAbsent: jest.fn().mockResolvedValue(null),
    findByNormalizedName: jest.fn().mockResolvedValue(sameName),
    setDictionaryGroup: jest.fn().mockResolvedValue(adopted),
  };

  return { service: new VendorDirectoryService(vendors as unknown as VendorRepo), vendors };
}

describe('VendorDirectoryService.ensureForDictionaryGroup when the insert meets an existing vendor (P29-N3)', () => {
  it('gives the free vendor of the same name the group, once', async () => {
    const { service } = directoryWith(vendor('v1', null), { vendor: vendor('v1', GROUP.id), adopted: true });

    await expect(service.ensureForDictionaryGroup(TX, ORGANIZATION, GROUP)).resolves.toEqual({
      vendor: vendor('v1', GROUP.id),
      created: false,
      adopted: true,
    });
  });

  it('refuses, without a write, when the vendor of the same name holds another group', async () => {
    const { service, vendors } = directoryWith(vendor('v1', 'group-other'), null);

    await expect(service.ensureForDictionaryGroup(TX, ORGANIZATION, GROUP)).rejects.toBeInstanceOf(
      VendorNameHeldByAnotherGroupError,
    );
    expect(vendors.setDictionaryGroup).not.toHaveBeenCalled();
  });

  it('returns the vendor of the same name that took this very group meanwhile', async () => {
    const { service, vendors } = directoryWith(vendor('v1', GROUP.id), null);

    await expect(service.ensureForDictionaryGroup(TX, ORGANIZATION, GROUP)).resolves.toEqual({
      vendor: vendor('v1', GROUP.id),
      created: false,
      adopted: false,
    });
    expect(vendors.setDictionaryGroup).not.toHaveBeenCalled();
  });

  it.each([
    ['the write lost to another vendor taking the group', vendor('v1', null)],
    ['no vendor carries the name any more', null],
  ])('reports a race when %s', async (_name, sameName) => {
    const { service } = directoryWith(sameName, null);

    await expect(service.ensureForDictionaryGroup(TX, ORGANIZATION, GROUP)).rejects.toBeInstanceOf(
      VendorDictionaryGroupChangedError,
    );
  });
});
