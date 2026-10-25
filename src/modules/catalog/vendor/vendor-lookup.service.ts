import { Injectable } from '@nestjs/common';
import { VendorRepo } from './vendor.repo';

/** What the facade of the catalog says of a vendor to the other modules: its name, and whether it exists. */
@Injectable()
export class VendorLookupService {
  constructor(private readonly vendors: VendorRepo) {}

  /** The name of the vendor, or null when there is none. */
  async nameOf(id: string): Promise<string | null> {
    return (await this.vendors.findPublic(id))?.name ?? null;
  }
}
