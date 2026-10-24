import { HttpStatus } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { ApiException } from '../../../infrastructure/http/errors/api.exception';
import type { AuditService } from '../../audit/audit.service';
import type { VendorDictionaryLookupService } from '../vendor-dictionary/vendor-dictionary-lookup.service';
import type { VendorProposalIntakeService } from '../vendor-dictionary/vendor-proposal-intake.service';
import type { VendorDirectoryService, VendorRecord } from '../vendor/vendor-directory.service';
import { ApplicationVendorLinkService } from './application-vendor-link.service';
import { ApplicationDictionaryLineMismatchError, ApplicationVendorGroupChangedError } from './application.errors';
import { toApplicationApiException } from './application.http-errors';
import type { ApplicationRecord } from './application.types';

const TX = {} as DbTx;
const ORGANIZATION = 'organization-1';
const VENDOR = 'vendor-1';
const MINE = 'group-mine';
const OTHER = 'group-other';

const vendor = (id: string, dictionaryGroupId: string | null): VendorRecord => ({
  id,
  name: 'Acme',
  dictionaryGroupId,
});

/** `holder` is who holds the group of the line when it is read; `adopted` is what the conditional write answers. */
function linkWith(holder: VendorRecord | null, adopted: { vendor: VendorRecord; adopted: boolean } | null) {
  const dictionary = {
    findLine: jest.fn().mockResolvedValue({ lineId: 'line-1', lineName: 'Mail', groupId: MINE, groupName: 'Mine' }),
  };
  const vendors = {
    findByDictionaryGroup: jest.fn().mockResolvedValue(holder),
    adoptDictionaryGroup: jest.fn().mockResolvedValue(adopted),
  };
  const service = new ApplicationVendorLinkService(
    dictionary as unknown as VendorDictionaryLookupService,
    vendors as unknown as VendorDirectoryService,
    {} as VendorProposalIntakeService,
    {} as AuditService,
  );

  return { service, vendors };
}

// Read when the change began: the vendor had no group yet.
const application = { vendor: { id: VENDOR, name: 'Acme', dictionaryGroupId: null } } as ApplicationRecord;

describe('ApplicationVendorLinkService.requireLine (DB-03)', () => {
  it('names the vendor and group when this call gave the vendor its group', async () => {
    const { service, vendors } = linkWith(null, { vendor: vendor(VENDOR, MINE), adopted: true });

    await expect(service.requireLine(TX, ORGANIZATION, application, 'line-1')).resolves.toEqual({
      vendorId: VENDOR,
      groupId: MINE,
    });
    expect(vendors.findByDictionaryGroup).toHaveBeenCalledWith(TX, ORGANIZATION, MINE);
  });

  it('refuses the loser of a race: the write finds the vendor already given another group, a conflict', async () => {
    const { service } = linkWith(null, null);

    await expect(service.requireLine(TX, ORGANIZATION, application, 'line-1')).rejects.toBeInstanceOf(
      ApplicationVendorGroupChangedError,
    );
  });

  it('keeps the mismatch, without a write, when another vendor already holds the group of the line', async () => {
    const { service, vendors } = linkWith(vendor('vendor-2', MINE), null);

    await expect(service.requireLine(TX, ORGANIZATION, application, 'line-1')).rejects.toBeInstanceOf(
      ApplicationDictionaryLineMismatchError,
    );
    expect(vendors.adoptDictionaryGroup).not.toHaveBeenCalled();
  });

  it('keeps the mismatch, without a write, when the vendor read already holds another group', async () => {
    const { service, vendors } = linkWith(null, null);
    const holding = { vendor: { id: VENDOR, name: 'Acme', dictionaryGroupId: OTHER } } as ApplicationRecord;

    await expect(service.requireLine(TX, ORGANIZATION, holding, 'line-1')).rejects.toBeInstanceOf(
      ApplicationDictionaryLineMismatchError,
    );
    expect(vendors.adoptDictionaryGroup).not.toHaveBeenCalled();
  });
});

describe('toApplicationApiException for the dictionary group of a vendor', () => {
  const answerOf = (error: Error) => {
    const mapped = toApplicationApiException(error) as ApiException;

    return { status: mapped.getStatus(), code: (mapped.getResponse() as { code: string }).code };
  };

  it('answers the race loser 409 with its own code (P29-N3), and the plain mismatch 422 as before', () => {
    expect(answerOf(new ApplicationVendorGroupChangedError())).toEqual({
      status: HttpStatus.CONFLICT,
      code: 'APPLICATION.DICTIONARY_GROUP_CHANGED',
    });
    expect(answerOf(new ApplicationDictionaryLineMismatchError())).toEqual({
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      code: 'APPLICATION.DICTIONARY_LINE_MISMATCH',
    });
  });
});
