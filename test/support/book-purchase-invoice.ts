import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { TransactionRunner } from '../../src/infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../src/infrastructure/security/tokens/access-token-verifier.port';
import { BudgetsApi } from '../../src/modules/budgets/public/budgets.api';
import type {
  PurchaseInvoiceRecordInput,
  PurchaseInvoiceRecorded,
} from '../../src/modules/budgets/public/budgets.types';
import type { ApiAccount } from './api-accounts';

/** What a harness gives for the invoice of a purchase to be booked: the running application, the organization, Finance and the budget year. */
export interface PurchaseBookingWorld {
  ctx: { app: INestApplication };
  seed: { organizationId: string };
  finance: ApiAccount;
  year: number;
}

let numbers = 0;

/**
 * The invoice a signed purchase invoice writes (`PI-1`), booked by the facade of the budgets in one transaction as the signature of Finance
 * books it: the only way an invoice enters `invoices` now that Finance no longer records one by hand. The defaults are an invoice of 6 million
 * for November of the budget year, booked into the commitment of the request when it names one; `over` changes what a test is about.
 */
export function bookPurchaseInvoice(
  world: PurchaseBookingWorld,
  vendorId: string,
  over: Partial<PurchaseInvoiceRecordInput> = {},
): Promise<PurchaseInvoiceRecorded> {
  numbers += 1;
  const finance: AuthenticatedPrincipal = {
    subject: world.finance.appUserId,
    appUserId: world.finance.appUserId,
    sessionId: randomUUID(),
    employeeId: world.finance.employeeId,
    directRoles: ['FINANCE'],
    roles: ['FINANCE'],
  };

  return world.ctx.app.get(TransactionRunner, { strict: false }).run((tx) =>
    world.ctx.app.get(BudgetsApi, { strict: false }).recordPurchaseInvoice(tx, finance, {
      organizationId: world.seed.organizationId,
      purchaseInvoiceId: randomUUID(),
      requestId: null,
      subscriptionId: null,
      vendorId,
      number: `BK-${numbers}`,
      issuedOn: `${world.year}-11-03`,
      serviceMonth: `${world.year}-11-01`,
      netMinor: 6_000_000n,
      deductibleTaxMinor: 0n,
      nonDeductibleTaxMinor: 0n,
      matchResult: 'MATCHED',
      chargedCostCenterId: null,
      unallocated: null,
      now: new Date(),
      ...over,
    }),
  );
}
