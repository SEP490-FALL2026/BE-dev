import { Injectable } from '@nestjs/common';
import { DbTx } from '../../../infrastructure/database/transaction-runner';
import { searchKey } from './vendor-matcher';
import { VendorProposalRepo } from './vendor-proposal.repo';

/** How an application declaration proposes software that is not in the dictionary (`US-04-01` AC-5). */
@Injectable()
export class VendorProposalIntakeService {
  constructor(private readonly proposals: VendorProposalRepo) {}

  /**
   * Proposes `name` in the caller's transaction and answers the id of the proposal it made; a proposal already open for
   * the name is kept, nothing is added and the answer is null.
   */
  raise(
    tx: DbTx,
    input: { organizationId: string; name: string; domains: string[]; sourceApplicationId: string },
  ): Promise<string | null> {
    return this.proposals.raise(tx, { ...input, normalizedName: searchKey(input.name) });
  }
}
