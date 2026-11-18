import type { RegistryEvent } from './api-collection-registry';

/** The events of the nested-array registry written by `MF3-B.5` (the transfer with its grace and old rights, P7, and the transfer of the person who asks, P8, `QĐ-110p`, of `mf2-mf3`). */
export const MF3B_REGISTRY_EVENTS: readonly RegistryEvent[] = [
  {
    registry: 'nested',
    key: 'departmentTransferGet#oldRights',
    change: 'added',
    to: 'bounded',
    bound: 'OLD_RIGHTS_MAX',
    finding: 'LD-14',
    item: 'g6-transfer-record',
    date: '2026-11-13',
    reason:
      'The old rights of a transfer with where each stands (P7): at most OLD_RIGHTS_MAX, the personal rights of one person.',
  },
  {
    registry: 'nested',
    key: 'departmentTransferGet#commitmentsReleased',
    change: 'added',
    to: 'bounded',
    bound: 'OLD_RIGHTS_MAX',
    finding: 'LD-14',
    item: 'g6-transfer-record',
    date: '2026-11-13',
    reason:
      'What went back to the budget of the old department the day the transfer took effect (P7): one entry for each currency, at most OLD_RIGHTS_MAX.',
  },
  {
    registry: 'nested',
    key: 'departmentTransferGet#snapshot.before.rights',
    change: 'added',
    to: 'bounded',
    bound: 'OLD_RIGHTS_MAX',
    finding: 'LD-14',
    item: 'g6-transfer-record',
    date: '2026-11-13',
    reason: 'The rights of the person the day the transfer took effect (P7): at most OLD_RIGHTS_MAX.',
  },
  {
    registry: 'nested',
    key: 'departmentTransferGet#snapshot.after.rights',
    change: 'added',
    to: 'bounded',
    bound: 'OLD_RIGHTS_MAX',
    finding: 'LD-14',
    item: 'g6-transfer-record',
    date: '2026-11-13',
    reason: 'What became of those rights when the transfer closed (P7): at most OLD_RIGHTS_MAX.',
  },
  {
    registry: 'nested',
    key: 'meDepartmentTransferGet#rights',
    change: 'added',
    to: 'bounded',
    bound: 'OLD_RIGHTS_MAX',
    finding: 'LD-14',
    item: 'g6-transfer-record',
    date: '2026-11-13',
    reason:
      'The rights of the old department the person still holds while the grace lasts (P8): at most OLD_RIGHTS_MAX.',
  },
];
