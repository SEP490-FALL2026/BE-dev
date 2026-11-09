import type { NestedArrayEntry } from './api-collection-registry';

/** The nested arrays of the answers added by `qd103-vendor-usage-import` (W6 of `qd103-108-alignment`). */
export const NESTED_ARRAYS_W6: readonly NestedArrayEntry[] = [
  {
    key: 'usageSourceGet#detectableGroups',
    classification: 'bounded',
    findings: [],
    owner: 'qd103-vendor-usage-import',
    businessMaximum: {
      maxItems: 4,
      source:
        'MAX_DETECTABLE_GROUPS in vendor-source.types.ts, the maxItems of detectableGroups in vendor-source.dto.ts: the groups G1 to G4 a source can detect',
    },
    rationale: 'The groups the source can detect (FR-4.4).',
    removeWhen: 'Review when MAX_DETECTABLE_GROUPS changes.',
  },
  {
    key: 'usageSourceList#detectableGroups',
    classification: 'bounded',
    findings: [],
    owner: 'qd103-vendor-usage-import',
    businessMaximum: {
      maxItems: 4,
      source:
        'MAX_DETECTABLE_GROUPS in vendor-source.types.ts, the maxItems of detectableGroups in vendor-source.dto.ts: the groups G1 to G4 a source can detect',
    },
    rationale: 'The groups each source of the page can detect (FR-4.4).',
    removeWhen: 'Review when MAX_DETECTABLE_GROUPS changes.',
  },
  {
    key: 'usageImportGet#summary.detectableGroups',
    classification: 'bounded',
    findings: [],
    owner: 'qd103-vendor-usage-import',
    businessMaximum: {
      maxItems: 4,
      source:
        'MAX_DETECTABLE_GROUPS in vendor-source.types.ts, the maxItems of the summary schema in vendor-import-summary.json.ts: the groups G1 to G4',
    },
    rationale: 'The groups the source of the report can detect.',
    removeWhen: 'Review when MAX_DETECTABLE_GROUPS changes.',
  },
  {
    key: 'usageImportGet#summary.warnings',
    classification: 'bounded',
    findings: [],
    owner: 'qd103-vendor-usage-import',
    businessMaximum: {
      maxItems: 10,
      source:
        'MAX_SUMMARY_WARNINGS in vendor-import.types.ts, the maxItems of the summary schema in vendor-import-summary.json.ts: the preview raises one warning today',
    },
    rationale: 'The warnings of the preview (a window longer than the history of the vendor).',
    removeWhen: 'Review when MAX_SUMMARY_WARNINGS changes.',
  },
  {
    key: 'usageImportGet#summary.unmappedEventTypes',
    classification: 'bounded',
    findings: [],
    owner: 'qd103-vendor-usage-import',
    businessMaximum: {
      maxItems: 200,
      source:
        'MAX_UNMAPPED_EVENT_TYPES in vendor-import.types.ts, the maxItems of the summary schema in vendor-import-summary.json.ts: the parser keeps the first 200 sorted',
    },
    rationale:
      'The types of event no class was given to; the IT Admin sorts them in the source before the report can be confirmed.',
    removeWhen: 'Review when MAX_UNMAPPED_EVENT_TYPES changes.',
  },
  {
    key: 'usageImportRowList#days',
    classification: 'bounded',
    findings: [],
    owner: 'qd103-vendor-usage-import',
    businessMaximum: {
      maxItems: 400,
      source:
        'MAX_DAYS_PER_ROW in vendor-import.types.ts, the maxItems of the row schema in vendor-import.dto.ts: a window of 366 days once each and the last activity; a row with more is wrong (TOO_MANY_DAYS)',
    },
    rationale: 'The days one row of the report names.',
    removeWhen: 'Review when MAX_DAYS_PER_ROW changes.',
  },
  {
    key: 'usageImportRowList#errors',
    classification: 'bounded',
    findings: [],
    owner: 'qd103-vendor-usage-import',
    businessMaximum: {
      maxItems: 20,
      source:
        'MAX_ROW_ERRORS in vendor-import.types.ts, the maxItems of the row schema in vendor-import.dto.ts: the parser keeps the first 20 faults of a row',
    },
    rationale: 'The faults of one row of the report.',
    removeWhen: 'Review when MAX_ROW_ERRORS changes.',
  },
  {
    key: 'usageUnmatchedIdentityList#candidates',
    classification: 'bounded',
    findings: [],
    owner: 'qd103-vendor-usage-import',
    businessMaximum: {
      maxItems: 10,
      source:
        'MAX_CANDIDATES in identity.types.ts, the maxItems of candidates in identity.dto.ts: an identifier that fits several people keeps at most ten of them',
    },
    rationale: 'The people an identifier of a vendor may be, by code and work email only.',
    removeWhen: 'Review when MAX_CANDIDATES changes.',
  },
  {
    key: 'ghostSeatRecommendationGet#recommendation.confidenceReasons',
    classification: 'bounded',
    findings: [],
    owner: 'qd103-ghost-seat-g3-g4',
    businessMaximum: {
      maxItems: 8,
      source:
        'the .max(8) of confidenceReasons in board.dto.ts: confidence has seven factors (CF-1 to CF-7), so at most 8 sentences',
    },
    rationale: 'The sentences that lowered the confidence of a recommendation.',
    removeWhen: 'Review when the factors of the confidence or the labels change.',
  },
  {
    key: 'ghostSeatRecommendationGet#recommendation.usageLabels',
    classification: 'bounded',
    findings: [],
    owner: 'qd103-ghost-seat-g3-g4',
    businessMaximum: {
      maxItems: 4,
      source: 'the .max(4) of usageLabels in board.dto.ts: the labels are P-05 and LOW_CONFIDENCE, so at most 4',
    },
    rationale: 'The labels of what the days of a recommendation rest on.',
    removeWhen: 'Review when the factors of the confidence or the labels change.',
  },
  {
    key: 'ghostSeatRecommendationList#confidenceReasons',
    classification: 'bounded',
    findings: [],
    owner: 'qd103-ghost-seat-g3-g4',
    businessMaximum: {
      maxItems: 8,
      source:
        'the .max(8) of confidenceReasons in board.dto.ts: confidence has seven factors (CF-1 to CF-7), so at most 8 sentences',
    },
    rationale: 'The sentences that lowered the confidence of each recommendation of the page.',
    removeWhen: 'Review when the factors of the confidence or the labels change.',
  },
  {
    key: 'ghostSeatRecommendationList#usageLabels',
    classification: 'bounded',
    findings: [],
    owner: 'qd103-ghost-seat-g3-g4',
    businessMaximum: {
      maxItems: 4,
      source: 'the .max(4) of usageLabels in board.dto.ts: the labels are P-05 and LOW_CONFIDENCE, so at most 4',
    },
    rationale: 'The labels of what the days of each recommendation of the page rest on.',
    removeWhen: 'Review when the factors of the confidence or the labels change.',
  },
];
