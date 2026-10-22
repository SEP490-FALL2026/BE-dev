import { Injectable } from '@nestjs/common';
import { VendorDictionaryRepo } from './vendor-dictionary.repo';
import type { VendorCandidate, VendorNormalization, VendorNormalizationKind } from './vendor-dictionary.types';
import { matchDescription, matchDomain, matchName, type MatchableLine } from './vendor-matcher';

const toCandidate = (line: MatchableLine): VendorCandidate => ({
  serviceLineId: line.lineId,
  serviceLineName: line.lineName,
  groupId: line.groupId,
  groupName: line.groupName,
});

/**
 * Recognises a vendor from a typed name, a domain or URL, or a bank description (`US-04-07` AC-1 → AC-3, AC-5). It only
 * ever returns candidates: more than one means the caller or the IT Admin chooses, and none means the vendor is not in
 * the dictionary. The dictionary is read in full once per call and matched in memory (T-D2).
 */
@Injectable()
export class VendorRecognitionService {
  constructor(private readonly repo: VendorDictionaryRepo) {}

  async suggest(name: string): Promise<VendorCandidate[]> {
    return matchName(name, await this.repo.listMatchable()).map(toCandidate);
  }

  async normalize(kind: VendorNormalizationKind, value: string): Promise<VendorNormalization> {
    const lines = await this.repo.listMatchable();
    const found = kind === 'DOMAIN' ? matchDomain(value, lines) : matchDescription(value, lines);
    if (found.length === 0) return { method: null, candidates: [] };

    return { method: kind === 'DOMAIN' ? 'DOMAIN' : 'PATTERN', candidates: found.map(toCandidate) };
  }
}
