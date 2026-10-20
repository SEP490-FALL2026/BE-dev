import { Injectable } from '@nestjs/common';
import { DbTx } from '../../../infrastructure/database/transaction-runner';
import { searchKey } from '../vendor-dictionary/vendor-matcher';
import { VendorRepo, type VendorRow } from './vendor.repo';

export type VendorRecord = VendorRow;

export interface EnsuredVendor {
  vendor: VendorRecord;
  /** True when this call made the vendor, so the caller records that in the audit trail. */
  created: boolean;
}

/**
 * The vendors of the organization as other capabilities of `catalog` reach them. A vendor is found by its normalized
 * name or its dictionary group, or made in the caller's transaction; two simultaneous callers that want the same new
 * vendor end up with the same row (`ON CONFLICT DO NOTHING`, then read), never with a duplicate or an error.
 */
@Injectable()
export class VendorDirectoryService {
  constructor(private readonly vendors: VendorRepo) {}

  find(tx: DbTx, id: string): Promise<VendorRecord | null> {
    return this.vendors.find(tx, id);
  }

  /** The vendor of a dictionary group; a free-text vendor of the same name takes the group over rather than doubling it. */
  async ensureForDictionaryGroup(
    tx: DbTx,
    organizationId: string,
    group: { id: string; name: string },
  ): Promise<EnsuredVendor> {
    const normalizedName = searchKey(group.name);
    const held = await this.vendors.findByDictionaryGroup(tx, organizationId, group.id);
    if (held) return { vendor: held, created: false };

    const inserted = await this.vendors.insertIfAbsent(tx, {
      organizationId,
      name: group.name,
      normalizedName,
      dictionaryGroupId: group.id,
    });
    if (inserted) return { vendor: inserted, created: true };

    const raced = await this.vendors.findByDictionaryGroup(tx, organizationId, group.id);
    if (raced) return { vendor: raced, created: false };
    const sameName = await this.vendors.findByNormalizedName(tx, organizationId, normalizedName);
    if (sameName?.dictionaryGroupId === null) {
      const adopted = await this.vendors.setDictionaryGroup(tx, sameName.id, group.id);
      if (adopted) return { vendor: adopted, created: false };
    }

    throw new Error('A vendor of the same name belongs to another dictionary group');
  }

  /** The vendor of this name outside the dictionary, found or made. */
  async ensureByName(tx: DbTx, organizationId: string, name: string): Promise<EnsuredVendor> {
    const normalizedName = searchKey(name);
    const found = await this.vendors.findByNormalizedName(tx, organizationId, normalizedName);
    if (found) return { vendor: found, created: false };

    const inserted = await this.vendors.insertIfAbsent(tx, {
      organizationId,
      name,
      normalizedName,
      dictionaryGroupId: null,
    });
    if (inserted) return { vendor: inserted, created: true };

    const raced = await this.vendors.findByNormalizedName(tx, organizationId, normalizedName);
    if (!raced) throw new Error('The vendor could neither be made nor found');

    return { vendor: raced, created: false };
  }

  /** Gives a vendor with no dictionary group the group of a line; null when another vendor already holds that group. */
  adoptDictionaryGroup(tx: DbTx, vendorId: string, groupId: string): Promise<VendorRecord | null> {
    return this.vendors.setDictionaryGroup(tx, vendorId, groupId);
  }
}
