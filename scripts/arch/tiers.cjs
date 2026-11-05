// Module tiers (docs/rules/module-structure.md). A module imports only modules of a lower tier, or the modules of its
// own tier listed in SAME_TIER. Read by .dependency-cruiser.cjs (the gate) and scripts/arch/graph.mjs (the picture).
const TIERS = [
  ['audit', 'notifications'],
  ['organization', 'identity-access'],
  ['finance', 'operating-parameters'],
  ['catalog', 'licensing'],
  ['budgets', 'requests', 'data-import'],
  ['personnel', 'onboarding', 'installation', 'ai-assist'],
  // The role overviews read through the facades of the modules below, personnel among them.
  ['dashboards'],
];

// Allowed edges inside one tier (importer -> imported).
const SAME_TIER = {
  'identity-access': ['organization'],
  'operating-parameters': ['finance'],
  licensing: ['catalog'],
  requests: ['budgets'],
};

module.exports = { TIERS, SAME_TIER };
