import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { CatalogApi } from '../../catalog/public/catalog.api';
import type { CatalogEntry } from '../../catalog/public/catalog.types';
import { AccessRequestApplicationRetiredError } from '../access-request/access-request.errors';
import { AssessmentReferenceNotFoundError, ProposalSoftwareInCatalogError } from './assessment.errors';
import type { AssessmentRepo } from './assessment.repo';
import { ProposalDeclarationService } from './proposal-declaration.service';

const tx = {} as DbTx;
const APPLICATION = '0b1d5e0e-6f55-4b3c-8d0e-0a4a8f3a0a11';
const declared = {
  softwareName: 'ChatGPT Business',
  homepageUrl: 'https://chatgpt.com',
  purpose: 'Drafting support replies',
  dataDescription: 'Customer questions',
  expectedUsers: 4,
};
const entry = (over: Partial<CatalogEntry> = {}): CatalogEntry => ({
  applicationId: APPLICATION,
  name: 'ChatGPT',
  status: 'APPROVED',
  vendor: { id: 'vendor-1', name: 'OpenAI' },
  plans: [{ planId: 'plan-plus', name: 'Plus', provisioningType: 'K1' }],
  planTotal: 1,
  planNamed: null,
  ...over,
});

/** The catalog as the declaration service asks it: only the two reads of the proposal, answered with what the test gives. */
const catalogOf = (answers: { match?: ReturnType<typeof matchOf> | null; entry?: CatalogEntry | null }) => {
  const asked: unknown[] = [];
  const catalog = {
    findCatalogEntryOfSoftware: (_tx: DbTx, software: unknown) => {
      asked.push(['software', software]);

      return Promise.resolve(answers.match ?? null);
    },
    getCatalogEntry: (_tx: DbTx, applicationId: string, planName?: string) => {
      asked.push(['entry', applicationId, planName]);

      return Promise.resolve(answers.entry ?? null);
    },
  } as unknown as CatalogApi;

  return { catalog, asked };
};
const matchOf = (by: 'NAME' | 'DOMAIN', found = entry()) => ({ by, entry: found });

const serviceOf = (catalog: CatalogApi) => new ProposalDeclarationService(catalog, {} as AssessmentRepo);

describe('judging a proposal against the catalog (QĐ-111a, QĐ-111b)', () => {
  describe('software that is new (no application named)', () => {
    it('goes on when the catalog has nothing like it, asking by the name and the page the person gave', async () => {
      const { catalog, asked } = catalogOf({});

      await expect(serviceOf(catalog).judge(tx, declared)).resolves.toBeNull();

      expect(asked).toEqual([['software', { name: 'ChatGPT Business', homepageUrl: 'https://chatgpt.com' }]]);
    });

    it.each(['NAME', 'DOMAIN'] as const)(
      'is refused with the entry the catalog has already, found by the %s',
      async (by) => {
        const { catalog } = catalogOf({ match: matchOf(by) });

        const refused = await serviceOf(catalog)
          .judge(tx, declared)
          .catch((error: unknown) => error);

        expect(refused).toBeInstanceOf(ProposalSoftwareInCatalogError);
        expect(refused).toMatchObject({ matchedBy: by, existing: { applicationId: APPLICATION, name: 'ChatGPT' } });
      },
    );
  });

  describe('a plan the application of the catalog lacks (case B, short)', () => {
    const short = { ...declared, existingApplicationId: APPLICATION, plannedPlanName: 'Business' };

    it('goes on with what the assessment starts from: the plan asked for and the vendor of the application', async () => {
      const { catalog, asked } = catalogOf({ entry: entry() });

      await expect(serviceOf(catalog).judge(tx, short)).resolves.toEqual({
        existingApplicationId: APPLICATION,
        plannedPlanName: 'Business',
        vendor: { id: 'vendor-1', name: 'OpenAI' },
      });
      // The application is the one the person chose: the catalog is not searched for a duplicate of the name.
      expect(asked).toEqual([['entry', APPLICATION, 'Business']]);
    });

    it('is refused when the application does not exist', async () => {
      const { catalog } = catalogOf({ entry: null });

      const refused = await serviceOf(catalog)
        .judge(tx, short)
        .catch((error: unknown) => error);

      expect(refused).toBeInstanceOf(AssessmentReferenceNotFoundError);
      expect(refused).toMatchObject({ field: 'existingApplicationId' });
    });

    it('is refused when the application has left the catalog', async () => {
      const { catalog } = catalogOf({ entry: entry({ status: 'RETIRED' }) });

      await expect(serviceOf(catalog).judge(tx, short)).rejects.toBeInstanceOf(AccessRequestApplicationRetiredError);
    });

    it('is refused with the application when it has the plan already: the person asks for it as case A', async () => {
      const { catalog } = catalogOf({
        entry: entry({
          plans: [{ planId: 'plan-biz', name: 'Business', provisioningType: 'K2' }],
          planNamed: { planId: 'plan-biz', name: 'Business' },
        }),
      });

      const refused = await serviceOf(catalog)
        .judge(tx, short)
        .catch((error: unknown) => error);

      expect(refused).toBeInstanceOf(ProposalSoftwareInCatalogError);
      expect(refused).toMatchObject({
        matchedBy: 'PLAN',
        existing: { applicationId: APPLICATION, plans: [{ planId: 'plan-biz', name: 'Business' }] },
      });
    });

    it('takes the vendor as absent when the application has none (software the company built)', async () => {
      const { catalog } = catalogOf({ entry: entry({ vendor: null }) });

      await expect(serviceOf(catalog).judge(tx, short)).resolves.toMatchObject({ vendor: null });
    });
  });
});
