import type { CatalogEntry } from '../../catalog/public/catalog.types';
import type { AssessorRefusal } from './assessment.policy';

/** The person may not fill or complete the assessment of this request now (`US-05-06`, `US-01-12` AC-2). */
export class AssessmentRefusedError extends Error {
  constructor(readonly reason: AssessorRefusal) {
    super(`The assessment cannot be changed: ${reason}.`);
    this.name = 'AssessmentRefusedError';
  }
}

/** The assessment lacks fields, so it cannot be completed and the request stays with the IT Admin (`US-05-06` AC-3, AC-14, AC-15). */
export class AssessmentIncompleteError extends Error {
  constructor(readonly missing: readonly string[]) {
    super('The assessment is not complete.');
    this.name = 'AssessmentIncompleteError';
  }
}

/** Internal software is completed by registering it in the catalog, not by completing the assessment (`US-05-20`). */
export class AssessmentInternalByRegistrationError extends Error {
  constructor() {
    super('Internal software is completed by registering it in the catalog.');
    this.name = 'AssessmentInternalByRegistrationError';
  }
}

/** A tool that cannot be controlled is refused at the gate with a reason, not sent on to the spending approver (`US-05-18` AC-1). */
export class AssessmentUncontrollableError extends Error {
  constructor() {
    super('A tool that cannot be controlled is refused at the gate, not completed.');
    this.name = 'AssessmentUncontrollableError';
  }
}

/** The quote cannot give the request an amount (`US-05-06` AC-14): it is not in force, or it is too large. */
export class AssessmentQuoteRefusedError extends Error {
  constructor(
    readonly reason: 'QUOTE_NOT_IN_FORCE' | 'QUOTE_PERIOD_INVALID' | 'AMOUNT_TOO_LARGE' | 'QUOTE_PRICE_NOT_VND',
  ) {
    super(`The quote cannot price the request: ${reason}.`);
    this.name = 'AssessmentQuoteRefusedError';
  }
}

/** Internal software cannot be registered for this request: it was not classified so, or the catalog refuses it (`US-05-20` AC-4, AC-8). */
export class InternalRegistrationRefusedError extends Error {
  constructor(readonly reason: 'NOT_INTERNAL' | 'NAME_TAKEN') {
    super(`The internal software cannot be registered: ${reason}.`);
    this.name = 'InternalRegistrationRefusedError';
  }
}

/** A vendor, plan or person the assessment names does not exist. */
export class AssessmentReferenceNotFoundError extends Error {
  constructor(readonly field: 'vendorId' | 'equivalentPlanId' | 'alternativePlanId' | 'existingApplicationId') {
    super(`The ${field} of the assessment does not exist.`);
    this.name = 'AssessmentReferenceNotFoundError';
  }
}

/**
 * The software proposed is in the catalog already (`QĐ-111b`): the same name or a domain the catalog has, or the plan asked for of an application the catalog
 * has. `existing` is the entry, so the person asks for it as case A instead.
 */
export class ProposalSoftwareInCatalogError extends Error {
  constructor(
    readonly existing: CatalogEntry,
    readonly matchedBy: 'NAME' | 'DOMAIN' | 'PLAN',
  ) {
    super('The catalog already has this software: ask for it from the catalog.');
    this.name = 'ProposalSoftwareInCatalogError';
  }
}

/**
 * The request cannot be linked to the plan: it is not waiting for its grant (`US-05-06` AC-4, AC-8), or the IT Admin asked to list the software in a
 * department they are not in charge of (`QĐ-111c`).
 */
export class CatalogLinkRefusedError extends Error {
  constructor(readonly reason: 'NOT_LINKABLE' | 'DEPARTMENT_OUT_OF_SCOPE') {
    super(`The request cannot be linked to the plan: ${reason}.`);
    this.name = 'CatalogLinkRefusedError';
  }
}
