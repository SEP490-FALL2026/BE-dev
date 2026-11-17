import { Injectable, OnModuleInit } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { CatalogResponsibilityApi } from '../../catalog/public/catalog-responsibility.api';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { PersonnelFileHookContributions, type PersonnelFileEvent } from '../public/personnel.extension-points';
import { ItHandoverRepo } from './it-handover.repo';

/**
 * When a departure or a transfer is recorded for a person who answers for subscriptions or applications in the catalog, keeps what they
 * answer for with the file, once (`QĐ-110j`, `R-8`, SPEC P1, P6): the `itHandover` section is read from it. It writes nothing for a person who
 * answers for nothing, and it never holds the record back (`QĐ-110e`); a failure of the hook itself rolls the record back like any other
 * failure inside the transaction.
 */
@Injectable()
export class ItHandoverRecorder implements OnModuleInit {
  /** The extension points this class registers with (gate extension-wiring, R1). */
  static readonly binds = [PersonnelFileHookContributions] as const;

  constructor(
    private readonly hooks: PersonnelFileHookContributions,
    private readonly items: ItHandoverRepo,
    private readonly catalog: CatalogResponsibilityApi,
    private readonly organizationReads: OrganizationReadApi,
  ) {}

  onModuleInit(): void {
    this.hooks.add('personnel.it-handover', { onRecorded: (tx, event) => this.keep(tx, event) });
  }

  private async keep(tx: DbTx, event: PersonnelFileEvent): Promise<void> {
    const left = (await this.catalog.countResponsibilitiesOf([event.employeeId], tx)).get(event.employeeId);
    if (!left || left.subscriptions + left.applications === 0) return;
    const organization = await this.organizationReads.getOrganization(tx);
    if (!organization) return;

    await this.items.insertItem(tx, {
      organizationId: organization.id,
      source: { kind: event.fileKind === 'OFFBOARDING' ? 'OFFBOARDING_CASE' : 'DEPARTMENT_TRANSFER', id: event.fileId },
      subscriptions: left.subscriptions,
      applications: left.applications,
    });
  }
}
