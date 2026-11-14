import { usageCollectionDefault } from './application.policy';
import type { ApplicationSummaryView, ApplicationView } from './application.types';

/** A row of the application list as it is answered. */
export function toSummaryWire(application: ApplicationSummaryView) {
  return {
    id: application.id,
    name: application.name,
    kind: application.kind,
    vendor: application.vendor ? { id: application.vendor.id, name: application.vendor.name } : null,
    dataSensitivity: application.dataSensitivity,
    logoUrl: application.logoUrl,
    isCommunicationService: application.isCommunicationService,
    responsibleItAdmin: application.responsibleItAdmin,
    needsResponsible: application.needsResponsible,
    usageCollectionDefault: usageCollectionDefault(application.isCommunicationService),
    functionalGroup: application.functionalGroup,
    status: application.status,
    updatedAt: application.updatedAt.toISOString(),
  };
}

/** The detail: the summary fields (the same function) and the rest of the application. */
export function toWire(application: ApplicationView) {
  return {
    ...toSummaryWire(application),
    dictionaryServiceLineId: application.dictionaryServiceLineId,
    domains: application.domains,
    createdAt: application.createdAt.toISOString(),
  };
}
