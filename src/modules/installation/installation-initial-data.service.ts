import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../infrastructure/database/transaction-runner';
import { CatalogBootstrapApi } from '../catalog/public/catalog-bootstrap.api';
import { PoliciesBootstrapApi } from '../policies/public/policies-bootstrap.api';

export interface InitialDataResult {
  /** Functional groups written for the organization (`QĐ-111bf`). */
  standardFunctionalGroups: number;
  /** Policies written with their first version in force (`QĐ-112b`). */
  initialPolicies: number;
}

/**
 * The data every organization starts with besides the people: the standard functional groups of the catalog and the fixed set of
 * policies of the library, written in the transaction of the installation so that no application lacks a group and no decision step lacks
 * a policy.
 */
@Injectable()
export class InstallationInitialDataService {
  constructor(
    private readonly catalog: CatalogBootstrapApi,
    private readonly policies: PoliciesBootstrapApi,
  ) {}

  async seed(tx: DbTx, organizationId: string): Promise<InitialDataResult> {
    const standardFunctionalGroups = await this.catalog.seedStandardFunctionalGroups(tx, organizationId);
    const initialPolicies = (await this.policies.seedInitialPolicies(tx, organizationId)).policiesCreated;

    return { standardFunctionalGroups, initialPolicies };
  }
}
