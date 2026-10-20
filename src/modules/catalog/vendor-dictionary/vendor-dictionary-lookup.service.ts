import { Injectable } from '@nestjs/common';
import { DbTx } from '../../../infrastructure/database/transaction-runner';
import { VendorDictionaryRepo } from './vendor-dictionary.repo';

export interface DictionaryLine {
  lineId: string;
  lineName: string;
  groupId: string;
  groupName: string;
}

/** What an application declaration needs to know about a service line of the shared vendor dictionary. */
@Injectable()
export class VendorDictionaryLookupService {
  constructor(private readonly dictionary: VendorDictionaryRepo) {}

  findLine(tx: DbTx, lineId: string): Promise<DictionaryLine | null> {
    return this.dictionary.findLineWithGroup(tx, lineId);
  }
}
