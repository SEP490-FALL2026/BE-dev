import { Injectable } from '@nestjs/common';
import { ContractQueryService } from '../contract/contract-query.service';

/**
 * What the usage module asks of the contracts of the catalog (`US-04-13` AC-15): which applications rest on a contract, so it can show the
 * usage sources of those applications at the contract. It reads nothing else of a contract and writes nothing.
 */
@Injectable()
export class CatalogContractApi {
  constructor(private readonly contracts: ContractQueryService) {}

  /**
   * The applications of the subscriptions that rest on a contract, each once, by id. Null when the contract does not exist; an empty list when
   * no subscription rests on it.
   */
  getApplicationIds(contractId: string): Promise<string[] | null> {
    return this.contracts.applicationIdsOf(contractId);
  }
}
