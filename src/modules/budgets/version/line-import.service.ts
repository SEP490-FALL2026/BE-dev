import { Injectable } from '@nestjs/common';
import { CsvError, parseCsv } from '../../../core/csv';
import { TransactionRunner, type DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../audit/public/audit.api';
import { FinanceApi } from '../../finance/public/finance.api';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { BudgetImportFileInvalidError } from '../budget/budget.errors';
import { LINE_DESCRIPTION_MAX, REASON_MAX } from '../budget/budget.policy';
import { budgetAuditEvent, BudgetFactsService } from '../budget/budget-facts.service';
import { VersionAccessService } from './version-access.service';
import { VersionHistoryService } from './version-history.service';
import { VersionLineRepo, type VersionLineRecord } from '../budget/version-line.repo';
import type { ImportWire } from '../budget/budget.dto';

const REQUIRED = ['cost_center_code', 'description', 'amount'] as const;
/** Columns of the file before `QĐ-101n`: a file that still has one is refused as a whole. */
const RETIRED = ['window_from', 'window_to', 'service_period_months', 'repeat_cycle', 'quote_valid_until'] as const;
/** The largest number of lines one file may add to a version. */
const MAX_ROWS = 1000;
/** The rows reported back one by one; the count says the rest. */
const REPORTED_ERRORS = 50;

/**
 * The lines of a version loaded from a file (`US-06-09` AC-3). Each row is judged on its own: the rows that are right are
 * added to the version, which is a draft and so is not the budget of anything until it is approved, and the others are
 * reported with the row and the reason. A file that cannot be read as a table refuses the whole of it. The lines added are kept
 * in the history of the version, two hundred at a time at most; a version of a year that has ended takes none.
 */
@Injectable()
export class LineImportService {
  constructor(
    private readonly runner: TransactionRunner,
    private readonly access: VersionAccessService,
    private readonly history: VersionHistoryService,
    private readonly lineRepo: VersionLineRepo,
    private readonly facts: BudgetFactsService,
    private readonly organizationReads: OrganizationReadApi,
    private readonly finance: FinanceApi,
    private readonly audit: AuditApi,
  ) {}

  /**
   * Throws BudgetNotFinanceError, BudgetImportFileInvalidError, BudgetVersionNotFoundError, BudgetYearEndedError and
   * BudgetVersionNotEditableError.
   */
  async load(actor: AuthenticatedPrincipal, id: string, text: string): Promise<ImportWire> {
    this.facts.requireFinance(actor);
    const table = this.read(text);
    return this.runner.run(async (tx) => {
      const version = await this.access.lockEditable(tx, id);

      const own = await this.facts.costCenter(version.costCenterId, tx);
      const codes = [...new Set(table.rows.map((row) => row.cost_center_code).filter((code) => code !== ''))];
      const known = new Set(
        (await this.organizationReads.getCostCentersByCodes(codes, tx)).map((center) => center.code),
      );

      const lines: Omit<VersionLineRecord, 'position'>[] = [];
      const errors: { row: number; code: string }[] = [];
      for (const [index, row] of table.rows.entries()) {
        const fileRow = index + 2;
        const problem = await this.judge(row, own.code, known, version.currency, tx);
        if (typeof problem === 'string') errors.push({ row: fileRow, code: problem });
        else lines.push(problem);
      }
      const first = lines.length > 0 ? await this.lineRepo.addLines(tx, id, lines) : null;
      if (first !== null) {
        await this.history.linesAdded(tx, actor, version, { kind: 'LINES_IMPORTED', firstPosition: first, lines });
      }

      await this.audit.record(
        tx,
        budgetAuditEvent(actor, version.organizationId, 'BUDGET_VERSION.LINES_IMPORTED', 'BUDGET_VERSION', id, {
          added: lines.length,
          rejected: errors.length,
          ...(first === null ? {} : { fromPosition: first, toPosition: first + lines.length - 1 }),
        }),
      );

      return { added: lines.length, rejected: errors.length, errors: errors.slice(0, REPORTED_ERRORS) };
    });
  }

  private read(text: string): { rows: Record<string, string>[] } {
    let cells: string[][];
    try {
      cells = parseCsv(text, { maxRows: MAX_ROWS + 1 });
    } catch (error) {
      if (error instanceof CsvError) {
        throw new BudgetImportFileInvalidError(
          error.reason === 'TOO_MANY_ROWS' ? 'TOO_MANY_ROWS' : 'NOT_CSV',
          error.reason,
        );
      }
      throw error;
    }
    const [header, ...rows] = cells;
    if (!header) throw new BudgetImportFileInvalidError('EMPTY');
    const names = header.map((cell) => cell.trim().toLowerCase());
    const retired = RETIRED.filter((column) => names.includes(column));
    if (retired.length > 0) throw new BudgetImportFileInvalidError('RETIRED_COLUMNS', retired.join(','));
    const missing = REQUIRED.filter((column) => !names.includes(column));
    if (missing.length > 0) throw new BudgetImportFileInvalidError('MISSING_COLUMNS', missing.join(','));
    if (rows.length === 0) throw new BudgetImportFileInvalidError('EMPTY');

    return {
      rows: rows.map((row) => Object.fromEntries(names.map((name, index) => [name, (row[index] ?? '').trim()]))),
    };
  }

  /** The line the row makes, or the code of what is wrong with it. */
  private async judge(
    row: Record<string, string>,
    ownCode: string,
    known: ReadonlySet<string>,
    currency: string,
    tx: DbTx,
  ): Promise<Omit<VersionLineRecord, 'position'> | string> {
    if (row.cost_center_code === '' || !known.has(row.cost_center_code)) return 'COST_CENTER_NOT_FOUND';
    if (row.cost_center_code !== ownCode) return 'COST_CENTER_MISMATCH';
    if (row.description === '') return 'DESCRIPTION_REQUIRED';
    // The texts are as long as the form takes and no longer, so that any line that is added can be kept in the history.
    if (row.description.length > LINE_DESCRIPTION_MAX) return 'DESCRIPTION_TOO_LONG';
    if ((row.note ?? '').length > REASON_MAX) return 'NOTE_TOO_LONG';
    let amountMinor: bigint;
    try {
      amountMinor = (await this.finance.parseMoney({ amount: row.amount ?? '', currency }, tx)).amountMinor;
    } catch {
      return 'AMOUNT_INVALID';
    }
    if (amountMinor < 0n) return 'AMOUNT_INVALID';
    const seats = row.seats ? Number(row.seats) : null;
    if (seats !== null && (!Number.isInteger(seats) || seats < 1)) return 'SEATS_INVALID';

    return {
      proposalId: null,
      proposalPosition: null,
      description: row.description,
      planId: null,
      seats,
      amountMinor,
      financeComment: row.note ? row.note : null,
      adjustmentReason: null,
    };
  }
}
