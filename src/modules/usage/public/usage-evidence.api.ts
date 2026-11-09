import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { UsageEvidenceService } from '../usage-evidence/usage-evidence.service';
import type { ApplicationUsageEvidence, EvidenceRequest } from './usage-evidence.types';

/**
 * The one door to the usage of an application for the rules of wasted seats (`G3`, `G4`; `FR-4.12`, `FR-4.14a`): what vendors reported and what
 * the collectors sent, as days tied to people when read, with how old each source is and whether its silence can mean not used. Reads only.
 * Only days and the metadata of a source come out: never the volume of use, a token or an event (`QĐ-101i`).
 */
@Injectable()
export class UsageEvidenceApi {
  constructor(private readonly evidence: UsageEvidenceService) {}

  /**
   * The vendor sources with a confirmed report and the collector, each with what it says of the people asked: the days of activity no later
   * report took over, whether the person appears at all (a login alone is not activity), the weakest way an identifier was tied to them and
   * the day a tie changed; and the identifiers of the application nobody is tied to, which conclude nothing. A source older than its kind
   * allows is `stale`, but the activity it shows is still returned (a positive fact does not expire).
   */
  evidenceFor(request: EvidenceRequest, tx?: DbTx): Promise<ApplicationUsageEvidence> {
    return this.evidence.evidenceFor(request, tx);
  }

  /** How many findings of activity with no seat to cover the day are open (`FR-4.8`): the count the IT Admin dashboard shows. */
  openFindingCount(tx?: DbTx): Promise<number> {
    return this.evidence.openFindingCount(tx);
  }
}
