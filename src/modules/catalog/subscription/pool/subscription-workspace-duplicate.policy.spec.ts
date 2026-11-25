import { liveIdsByWorkspacePlan, liveWorkspaceSiblingsOf, type LivenessFacts } from './subscription-pool.policy';

describe('W3-14: live subscriptions keyed by (workspaceId, planId)', () => {
  const TODAY = '2026-11-15';
  const row = (over: Partial<LivenessFacts> & { id: string }): LivenessFacts => ({
    planId: 'plan-1',
    workspaceId: 'ws-a',
    status: 'ACTIVE',
    kind: 'TERM',
    endDate: '2026-12-31',
    renewed: false,
    ...over,
  });

  it('finds live siblings in the same (workspaceId, planId) and leaves out selfId, ended, renewed, and other workspaces', () => {
    const rows: LivenessFacts[] = [
      row({ id: 'sub-a1', workspaceId: 'ws-a' }),
      row({ id: 'sub-a2', workspaceId: 'ws-a', status: 'DRAFT', endDate: null }),
      row({ id: 'sub-a-ended', workspaceId: 'ws-a', endDate: '2026-11-14' }),
      row({ id: 'sub-a-renewed', workspaceId: 'ws-a', renewed: true }),
      row({ id: 'sub-b1', workspaceId: 'ws-b' }),
    ];

    const live = liveIdsByWorkspacePlan(rows, TODAY);

    expect(liveWorkspaceSiblingsOf(live, 'ws-a', 'plan-1', null)).toEqual(['sub-a1', 'sub-a2']);
    expect(liveWorkspaceSiblingsOf(live, 'ws-a', 'plan-1', 'sub-a2')).toEqual(['sub-a1']);
    expect(liveWorkspaceSiblingsOf(live, 'ws-b', 'plan-1', null)).toEqual(['sub-b1']);
    expect(liveWorkspaceSiblingsOf(live, 'ws-c', 'plan-1', null)).toEqual([]);
  });
});
