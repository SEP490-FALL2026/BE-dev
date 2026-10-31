/**
 * The plans declared under an application, as far as the view of the application needs them to work out which plan change
 * is worth recommending (`US-04-02` AC-9). The plans belong to `plan/`: an application is the root of the catalog and does not
 * import the plans that depend on it, so it names this one read and `PlanFactsService` answers it (`CatalogModule` binds
 * the two).
 */
export abstract class ApplicationPlans {
  abstract plansOfApplication(applicationId: string): Promise<{ id: string; provisioningType: string }[]>;
}
