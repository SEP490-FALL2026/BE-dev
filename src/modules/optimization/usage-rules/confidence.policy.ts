import type { BusinessDate } from '../../../core/business-date';
import type { EvidenceMatchMethod } from '../../usage/public/usage-evidence.types';
import type { GhostSeatConfidence } from '../ghost-seat/ghost-seat.types';

export interface ConfidenceFacts {
  /** The weakest way an identifier of the person was tied to them, over the sources that name them. */
  weakestMethod: EvidenceMatchMethod | null;
  /** Some source the days came from reads activity loosely (`LOOSE`). */
  looseSource: boolean;
  /** The days came, in part, from the collector (the label `P-05`). */
  usesCollector: boolean;
  coverageDays: number;
  /** The days that were to be covered: from the day the seat could be used to today, without the days of long leave. */
  daysConsidered: number;
  /** The age of the freshest source that tells the negative: a vendor of 4-7 days or a collector of 8-14 is old data. */
  oldestSource: { kind: 'VENDOR' | 'COLLECTOR'; ageDays: number } | null;
  /** The days without activity above the lower threshold of the tier (null for `G3`, which has no tier below). */
  daysOverLowerThreshold: number | null;
  /** Signals that disagree with the days, one sentence each (`CF-7`). */
  contradictions: readonly string[];
}

export interface ConfidenceResult {
  level: GhostSeatConfidence;
  reasons: string[];
}

/** Whether a source is old enough to weaken a conclusion without making it stale (`QĐ-101b`: a vendor is stale over 7 days, a collector over 14). */
const isOldData = (source: { kind: 'VENDOR' | 'COLLECTOR'; ageDays: number }): boolean =>
  source.kind === 'VENDOR' ? source.ageDays >= 4 : source.ageDays >= 8;

/**
 * How sure the rule is (`QĐ-35b`, `QĐ-101j`, `FR-4.14`): high, and each factor lowers it one step, two or more is low, with a sentence for each.
 * `CF-6` reads the days over the lower threshold of the tier; `inactiveDays` already counts covered days, so it is the days of coverage over the
 * lower threshold that the text of the BRD means. It changes neither the tier nor who is told, and is never a percentage.
 */
export function confidenceOf(facts: ConfidenceFacts): ConfidenceResult {
  const reasons: string[] = [];
  if (facts.weakestMethod === 'ALIAS_RULE') reasons.push('The person was tied to the identifier by an alias rule.');
  if (facts.looseSource) reasons.push('A source reads activity loosely.');
  if (facts.usesCollector) reasons.push('Part of the days comes from the collector (P-05).');
  if (facts.daysConsidered > 0 && facts.coverageDays < 0.8 * facts.daysConsidered) {
    reasons.push('The sources cover less than 80% of the days judged.');
  }
  if (facts.oldestSource && isOldData(facts.oldestSource)) reasons.push('The data of a source is a few days old.');
  if (facts.daysOverLowerThreshold !== null && facts.daysOverLowerThreshold < 14) {
    reasons.push('The days without activity are within 14 of the lower threshold of the tier.');
  }
  reasons.push(...facts.contradictions);
  const level: GhostSeatConfidence = reasons.length >= 2 ? 'LOW' : reasons.length === 1 ? 'MEDIUM' : 'HIGH';

  return { level, reasons };
}

/** The signals that disagree with the days of a person (`CF-7`, `DA6-41`): one sentence for each that is present. */
export function contradictionsOf(input: {
  lastActiveDate: BusinessDate | null;
  lastAuthOnlyDate: BusinessDate | null;
  mappingChangedOn: BusinessDate | null;
  unmatchedLastActivity: readonly (BusinessDate | null)[];
}): string[] {
  const after = (day: BusinessDate | null): boolean =>
    day !== null && (input.lastActiveDate === null || day > input.lastActiveDate);
  const out: string[] = [];
  if (after(input.lastAuthOnlyDate))
    out.push('Contradicting signal: the person logged in after the last day of activity.');
  if (after(input.mappingChangedOn))
    out.push('Contradicting signal: an identifier was tied or untied after the last day of activity.');
  if (input.unmatchedLastActivity.some(after)) {
    out.push(
      'Contradicting signal: an identifier of the application tied to no one was active after the last day of activity.',
    );
  }

  return out;
}

/** The facts the confidence rests on, from what the pass found of one seat: the sources the days came from, how the person was tied, the coverage and the signals against. */
export function confidenceFactsOf(input: {
  person: {
    weakestMethod: EvidenceMatchMethod | null;
    inCollector: boolean;
    lastAuthOnlyDate: BusinessDate | null;
    mappingChangedOn: BusinessDate | null;
  };
  usedSources: ReadonlyArray<{
    kind: 'VENDOR' | 'COLLECTOR';
    ageDays: number | null;
    strictness: 'STRICT' | 'LOOSE' | null;
  }>;
  unmatchedLastActivity: readonly (BusinessDate | null)[];
  lastActiveDate: BusinessDate | null;
  coverageDays: number;
  daysConsidered: number;
  /** The days without activity over the lower threshold of the tier; null for a seat never active. */
  daysOverLowerThreshold: number | null;
}): ConfidenceFacts {
  const oldest = input.usedSources
    .filter((source) => source.ageDays !== null)
    .sort((a, b) => (b.ageDays ?? 0) - (a.ageDays ?? 0))[0];

  return {
    weakestMethod: input.person.weakestMethod,
    looseSource: input.usedSources.some((source) => source.strictness === 'LOOSE'),
    usesCollector: input.person.inCollector,
    coverageDays: input.coverageDays,
    daysConsidered: input.daysConsidered,
    oldestSource: oldest ? { kind: oldest.kind, ageDays: oldest.ageDays ?? 0 } : null,
    daysOverLowerThreshold: input.daysOverLowerThreshold,
    contradictions: contradictionsOf({
      lastActiveDate: input.lastActiveDate,
      lastAuthOnlyDate: input.person.lastAuthOnlyDate,
      mappingChangedOn: input.person.mappingChangedOn,
      unmatchedLastActivity: input.unmatchedLastActivity,
    }),
  };
}
