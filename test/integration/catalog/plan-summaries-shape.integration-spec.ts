import { CatalogApi } from '../../../src/modules/catalog/public/catalog.api';
import { SeatHarness } from '../../support/seat-baseline-harness';

const h = new SeatHarness();

/**
 * The summary of a plan that the views of other modules answer whole (`GET /me/access-requests` puts the object itself on the wire, and the
 * schema of a wire object refuses a key it does not name): `getPlanSummaries` keeps exactly its four keys, whatever the application has, and only
 * `getPlanSummariesWithLogo` adds the logo. A fifth key on the first one is a 500 for every view that does not know it.
 */
describe('the summaries of plans the catalog gives to other modules (integration, real PostgreSQL)', () => {
  let planId: string;

  beforeAll(async () => {
    await h.start();
    planId = await h.plan('K5');
    await h.ctx.sql.query(
      `UPDATE applications SET logo_url = 'https://cdn.example.com/summary.png'
        WHERE id = (SELECT application_id FROM plans WHERE id = $1)`,
      [planId],
    );
  }, 240000);

  afterAll(async () => {
    await h.stop();
  });

  it('keeps the four keys of a summary even for an application that has a logo', async () => {
    const [summary] = await h.ctx.app.get(CatalogApi).getPlanSummaries([planId]);

    expect(Object.keys(summary).sort()).toEqual(['applicationId', 'applicationName', 'planId', 'planName']);
  });

  it('adds the logo of the application, and nothing else, in the summary that asks for it', async () => {
    const [summary] = await h.ctx.app.get(CatalogApi).getPlanSummariesWithLogo([planId]);

    expect(Object.keys(summary).sort()).toEqual([
      'applicationId',
      'applicationLogoUrl',
      'applicationName',
      'planId',
      'planName',
    ]);
    expect(summary.applicationLogoUrl).toBe('https://cdn.example.com/summary.png');
  });
});
