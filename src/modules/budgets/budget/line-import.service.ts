import { Injectable } from '@nestjs/common';
import { CsvError, parseCsv } from '../../../core/csv';
import { isBusinessDate } from '../../../core/business-date';
import { TransactionRunner, type DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditService } from '../../audit/audit.service';
import { FinanceService } from '../../finance/finance.service';
import { OrganizationService } from '../../organization/organization.service';
import { BudgetImportFileInvalidError } from './budget.errors';
import { LINE_DESCRIPTION_MAX, REASON_MAX, type RepeatCycle } from './budget.policy';
import { budgetAuditEvent, BudgetSupportService } from './budget-support.service';
import { VersionAccessService } from './version-access.service';
import { VersionHistoryService } from './version-history.service';
import { VersionLineRepo, type VersionLineRecord } from './version-line.repo';
import type { ImportWire } from './budget.dto';

const REQUIRED = [
  'cost_center_code',
  'description',
  'amount',
  'window_from',
  'window_to',
  'service_period_months',
  'repeat_cycle',
] as const;
const CYCLES: readonly string[] = ['MONTHLY', 'QUARTERLY', 'ANNUAL', 'ONE_TIME'];
/** The largest number of lines one file may add to a version. */
const MAX_ROWS = 1000;
/** The rows reported back one by one; the count says the rest. */
const REPORTED_ERRORS = 50;

/**
 * The lines of a version loaded from a file (`US-06-09` AC-3). Each row is judged on its own: the rows that are right are
 * added to the version, which is a draft and so is not the budget of anything until it is approved, and the others are
 * reported with the row and the reason. A file that cannot be read as a table refuses the whole of it. The lines added are kept
 * in the history of the version, two hundred at a time at most (F66); a version of a year that has ended takes none (F62).
 */
@Injectable()
export class LineImportService {
  constructor(
    private readonly runner: TransactionRunner,
    private readonly access: VersionAccessService,
    private readonly history: VersionHistoryService,
    private readonly lineRepo: VersionLineRepo,
    private readonly support: BudgetSupportService,
    private readonly organization: OrganizationService,
    private readonly finance: FinanceService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Throws BudgetNotFinanceError, BudgetImportFileInvalidError, BudgetVersionNotFoundError, BudgetYearEndedError and
   * BudgetVersionNotEditableError.
   */
  async load(actor: AuthenticatedPrincipal, id: string, text: string): Promise<ImportWire> {
    this.support.requireFinance(actor);
    const table = this.read(text);
    const fiscalStart = await this.support.fiscalYearStartMonth();

    return this.runner.run(async (tx) => {
      const version = await this.access.lockEditable(tx, id, fiscalStart);

      const own = await this.support.costCenter(version.costCenterId, tx);
      const codes = [...new Set(table.rows.map((row) => row.cost_center_code).filter((code) => code !== ''))];
      const known = new Set((await this.organization.getCostCentersByCodes(codes, tx)).map((center) => center.code));

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
    // The texts are as long as the form takes and no longer, so that any line that is added can be kept in the history (F66).
    if (row.description.length > LINE_DESCRIPTION_MAX) return 'DESCRIPTION_TOO_LONG';
    if ((row.note ?? '').length > REASON_MAX) return 'NOTE_TOO_LONG';
    let amountMinor: bigint;
    try {
      amountMinor = (await this.finance.parseMoney({ amount: row.amount ?? '', currency }, tx)).amountMinor;
    } catch {
      return 'AMOUNT_INVALID';
    }
    if (amountMinor < 0n) return 'AMOUNT_INVALID';
    const { window_from: from = '', window_to: to = '', quote_valid_until: quote = '' } = row;
    if (!isBusinessDate(from) || !isBusinessDate(to) || (quote !== '' && !isBusinessDate(quote))) return 'DATE_INVALID';
    if (to < from) return 'WINDOW_BACKWARDS';
    const service = Number(row.service_period_months);
    if (!Number.isInteger(service) || service < 1 || service > 120) return 'SERVICE_PERIOD_INVALID';
    if (!CYCLES.includes(row.repeat_cycle ?? '')) return 'REPEAT_CYCLE_INVALID';
    const seats = row.seats ? Number(row.seats) : null;
    if (seats !== null && (!Number.isInteger(seats) || seats < 1)) return 'SEATS_INVALID';

    return {
      proposalId: null,
      proposalPosition: null,
      description: row.description,
      planId: null,
      seats,
      amountMinor,
      windowFrom: from,
      windowTo: to,
      servicePeriodMonths: service,
      repeatCycle: row.repeat_cycle as RepeatCycle,
      quoteValidUntil: quote === '' ? null : quote,
      financeComment: row.note ? row.note : null,
      adjustmentReason: null,
    };
  }
}
