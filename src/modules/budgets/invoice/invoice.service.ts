import { Injectable } from '@nestjs/common';
import { Page, pageOf } from '../../../core/application/pagination';
import { MoneyOutOfRangeError } from '../../../core/money/money.errors';
import { Prisma } from '../../../generated/prisma/client';
import { TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../audit/public/audit.api';
import {
  BudgetCommitmentNotFoundError,
  InvoiceCommitmentReleasedError,
  InvoiceDuplicateError,
  InvoiceVendorUnknownError,
} from '../budget/budget.errors';
import { budgetAuditEvent, BudgetFactsService } from '../budget/budget-facts.service';
import { CommitmentRepo } from '../budget/commitment.repo';
import { planInvoice } from '../budget/invoice.policy';
import { InvoiceRepo, type InvoiceRecord } from '../budget/invoice.repo';
import { CommitmentService } from '../commitment/commitment.service';
import type { CommitmentWire } from '../commitment/commitment.dto';
import { CommitmentRequestFactsHook } from '../public/budgets.extension-points';
import type { InvoiceBodyDto, InvoiceWire } from './invoice.dto';

/**
 * Finance records an invoice against a commitment (`US-12-02`), and the commitment becomes an expense by it (`US-06-06` AC-1, AC-5).
 * Everything happens in one transaction with the row of the commitment locked, so two invoices on one commitment queue and never
 * take it down by more than it holds. The budget year is not locked: an invoice is a fact and is never refused for being over the
 * budget (`C-08`, `US-06-06` AC-17), so it has nothing to queue behind the check of a request. The vendor is the one of the request
 * behind the commitment, never one the client names.
 */
@Injectable()
export class InvoiceService {
  constructor(
    private readonly runner: TransactionRunner,
    private readonly commitments: CommitmentRepo,
    private readonly invoices: InvoiceRepo,
    private readonly facts: BudgetFactsService,
    private readonly audit: AuditApi,
    private readonly requestFacts: CommitmentRequestFactsHook,
    private readonly commitmentViews: CommitmentService,
  ) {}

  /** Throws BudgetCommitmentNotFoundError, InvoiceVendorUnknownError, InvoiceCommitmentReleasedError, InvoiceDuplicateError and the money errors. */
  async record(
    actor: AuthenticatedPrincipal,
    commitmentId: string,
    body: InvoiceBodyDto,
  ): Promise<{ invoice: InvoiceWire; commitment: CommitmentWire }> {
    const recorded = await this.runner.run(async (tx) => {
      const row = await this.commitments.lockById(tx, commitmentId);
      if (!row) throw new BudgetCommitmentNotFoundError();
      const request = (await this.requestFacts.get().factsOf([row.requestId])).get(row.requestId);
      if (!request?.vendorId) throw new InvoiceVendorUnknownError();

      const figures = await this.figuresOf(body, row.currency, tx);
      const plan = planInvoice(row, await this.invoices.netRecorded(tx, row.id), figures);
      if (!plan.ok) {
        throw plan.refusal === 'COMMITMENT_RELEASED'
          ? new InvoiceCommitmentReleasedError()
          : new MoneyOutOfRangeError();
      }
      if (await this.invoices.exists(tx, row.organizationId, request.vendorId, body.number)) {
        throw new InvoiceDuplicateError();
      }

      const invoice = await this.insert(tx, {
        organizationId: row.organizationId,
        commitmentId: row.id,
        vendorId: request.vendorId,
        number: body.number,
        issuedOn: body.issuedOn,
        currency: row.currency,
        ...figures,
        actualCostMinor: plan.actualCostMinor,
        appliedMinor: plan.takeMinor,
        matchResult: plan.matchResult,
        note: body.note ?? null,
        recordedByEmployeeId: actor.employeeId,
        now: new Date(),
      });
      await this.commitments.applyInvoice(tx, row, plan);
      await this.audit.record(
        tx,
        budgetAuditEvent(actor, row.organizationId, 'INVOICE.RECORDED', 'INVOICE', invoice.id, {
          commitmentId: row.id,
          requestId: row.requestId,
          number: invoice.number,
          netMinor: figures.netMinor.toString(),
          deductibleTaxMinor: figures.deductibleTaxMinor.toString(),
          nonDeductibleTaxMinor: figures.nonDeductibleTaxMinor.toString(),
          actualCostMinor: plan.actualCostMinor.toString(),
          appliedMinor: plan.takeMinor.toString(),
          heldMinor: plan.heldAfterMinor.toString(),
          matchResult: plan.matchResult,
        }),
      );

      return invoice;
    });

    const [invoice] = await this.wires([recorded]);
    const commitment = (await this.commitmentViews.page({ id: commitmentId, page: 1, pageSize: 1 })).items[0];

    return { invoice, commitment };
  }

  /** The invoices recorded against a commitment, the newest first. Throws BudgetCommitmentNotFoundError. */
  async page(commitmentId: string, query: { page: number; pageSize: number }): Promise<Page<InvoiceWire>> {
    if (!(await this.commitments.exists(commitmentId))) throw new BudgetCommitmentNotFoundError();
    const { rows, total } = await this.invoices.page(commitmentId, (query.page - 1) * query.pageSize, query.pageSize);

    return pageOf(await this.wires(rows), total, query.page, query.pageSize);
  }

  /** What the invoice states, in the minor units of the currency of the commitment: tax that is left out is nothing. */
  private async figuresOf(body: InvoiceBodyDto, currency: string, tx: Parameters<InvoiceRepo['insert']>[0]) {
    const minor = (input: { amount: string } | undefined) =>
      input ? this.facts.moneyIn(input, currency, tx) : Promise.resolve(0n);

    return {
      netMinor: await minor(body.netAmount),
      deductibleTaxMinor: await minor(body.deductibleTax),
      nonDeductibleTaxMinor: await minor(body.nonDeductibleTax),
    };
  }

  /** A second invoice with the same number from the same vendor loses the race at the unique index and is told so. */
  private async insert(tx: Parameters<InvoiceRepo['insert']>[0], input: Parameters<InvoiceRepo['insert']>[1]) {
    try {
      return await this.invoices.insert(tx, input);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new InvoiceDuplicateError();
      }
      throw error;
    }
  }

  private async wires(rows: readonly InvoiceRecord[]): Promise<InvoiceWire[]> {
    const people = await this.facts.people(rows.map((row) => row.recordedByEmployeeId));
    const formatters = new Map<string, Awaited<ReturnType<BudgetFactsService['formatter']>>>();
    for (const code of new Set(rows.map((row) => row.currency))) formatters.set(code, await this.facts.formatter(code));

    return rows.map((row): InvoiceWire => {
      const money = formatters.get(row.currency) as Awaited<ReturnType<BudgetFactsService['formatter']>>;

      return {
        id: row.id,
        number: row.number,
        issuedOn: row.issuedOn,
        netAmount: money(row.netMinor),
        deductibleTax: money(row.deductibleTaxMinor),
        nonDeductibleTax: money(row.nonDeductibleTaxMinor),
        actualCost: money(row.actualCostMinor),
        matchResult: row.matchResult,
        note: row.note,
        recordedBy: people.get(row.recordedByEmployeeId) ?? null,
        recordedAt: row.recordedAt.toISOString(),
      };
    });
  }
}
