import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { isCheckViolation, isUniqueViolation } from '../../../infrastructure/database/unique-violation';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { FunctionalGroupFactsService } from '../functional-group/functional-group-facts.service';
import { VendorDictionaryGroupChangedError, VendorNameHeldByAnotherGroupError } from '../vendor/vendor.errors';
import {
  ApplicationDictionaryLineMismatchError,
  ApplicationDictionaryLineTakenError,
  ApplicationFunctionalGroupInvalidError,
  ApplicationNameTakenError,
  ApplicationVendorGroupChangedError,
} from './application.errors';

/**
 * What a write of an application checks about what it refers to (`US-04-01`): that the organization exists, that the functional group
 * is active; and the answer to what the database refused by the column it names.
 */
@Injectable()
export class ApplicationWriteGuards {
  constructor(
    private readonly organizationReads: OrganizationReadApi,
    private readonly functionalGroups: FunctionalGroupFactsService,
  ) {}

  async requireActiveGroup(tx: DbTx, id: string): Promise<{ id: string; name: string }> {
    const group = await this.functionalGroups.findActive(tx, id);
    if (!group) throw new ApplicationFunctionalGroupInvalidError();

    return group;
  }

  mapWriteError(error: unknown): unknown {
    if (error instanceof VendorNameHeldByAnotherGroupError) return new ApplicationDictionaryLineMismatchError();
    if (error instanceof VendorDictionaryGroupChangedError) return new ApplicationVendorGroupChangedError();
    if (isUniqueViolation(error, 'dictionary_line_id')) return new ApplicationDictionaryLineTakenError();
    if (isUniqueViolation(error, 'normalized_name')) return new ApplicationNameTakenError();
    if (isCheckViolation(error)) return new ApplicationDictionaryLineMismatchError();

    return error;
  }

  async requireOrganizationId(): Promise<string> {
    const organization = await this.organizationReads.getOrganization();
    if (!organization) throw new Error('The application catalog was used before installation');

    return organization.id;
  }
}
