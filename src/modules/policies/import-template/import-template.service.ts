import { Injectable } from '@nestjs/common';
import ExcelJS from 'exceljs';
import type {
  ImportTemplateColumn,
  ImportTemplateDefinition,
  ImportTemplateFormat,
  ImportTemplateKind,
} from '../public/policies.types';
import { ImportTemplateContributions } from '../public/policies.extension-points';
import {
  ImportTemplateDefinitionError,
  ImportTemplateForbiddenError,
  ImportTemplateFormatNotSupportedError,
  ImportTemplateNotAvailableError,
} from './import-template.errors';
import {
  canDownloadTemplate,
  definitionProblems,
  guideRowsOf,
  templateCsvOf,
  templateFileName,
} from './import-template.policy';

export interface TemplateFile {
  fileName: string;
  contentType: string;
  bytes: Buffer;
}

const NUMBER_FORMAT = '#,##0';
const isNumber = (column: ImportTemplateColumn): boolean => column.kind === 'integer' || column.kind === 'vnd';

const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const CSV_TYPE = 'text/csv; charset=utf-8';

/**
 * The file a person prepares an import in (`QĐ-111as`): built from what the module that reads the file says its columns are, so the header is
 * the one the parser reads and the example rows are rows it reads back without error. The sheet of data comes first so the file opens on it;
 * the instruction sheet says what each column holds, whether it is required, how it is written, an example and what is refused.
 */
@Injectable()
export class ImportTemplateService {
  constructor(private readonly sources: ImportTemplateContributions) {}

  /**
   * Throws ImportTemplateNotAvailableError, ImportTemplateForbiddenError, ImportTemplateFormatNotSupportedError and
   * ImportTemplateDefinitionError. Without a format it is the one the parser reads first.
   */
  async build(
    kind: ImportTemplateKind,
    askedFormat: ImportTemplateFormat | undefined,
    callerRoles: readonly string[],
  ): Promise<TemplateFile> {
    const definition = this.sources
      .all()
      .flatMap((source) => source.definitions())
      .find((candidate) => candidate.kind === kind);
    if (!definition) throw new ImportTemplateNotAvailableError();
    if (!canDownloadTemplate(kind, callerRoles)) throw new ImportTemplateForbiddenError();
    const problems = definitionProblems(definition);
    if (problems.length > 0) throw new ImportTemplateDefinitionError(kind, problems);
    const format = askedFormat ?? definition.formats[0];
    if (!definition.formats.includes(format)) throw new ImportTemplateFormatNotSupportedError(definition.formats);

    return {
      fileName: templateFileName(kind, format),
      contentType: format === 'xlsx' ? XLSX_TYPE : CSV_TYPE,
      bytes: format === 'xlsx' ? await this.workbookOf(definition) : Buffer.from(templateCsvOf(definition), 'utf8'),
    };
  }

  private async workbookOf(definition: ImportTemplateDefinition): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    const data = workbook.addWorksheet(definition.form ? 'BM-10' : 'Dữ liệu');
    // The format is set for the whole column before any cell exists, so a cell a person types later takes it too: a code that starts with
    // zeros stays text, an amount stays a number.
    data.columns = definition.columns.map((column) => ({
      key: column.key,
      width: Math.max(18, (column.label ?? column.key).length + 4),
      style: { numFmt: isNumber(column) ? NUMBER_FORMAT : '@' },
    }));
    const headerRow = definition.form ? this.addFormHeading(data, definition.form, definition.columns.length) : 1;
    const header = data.addRow(
      definition.columns.map((column) => (definition.form ? (column.label ?? column.key) : column.key)),
    );
    header.font = { bold: true };
    header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE7ECF3' } };
    const first = data.rowCount + 1;
    for (const row of definition.sampleRows) data.addRow(this.cellsOf(definition, row, data.rowCount + 1));
    if (definition.form?.totalLabel) this.addTotal(data, definition, first, data.rowCount);
    data.views = [{ state: 'frozen', ySplit: headerRow }];
    const guide = workbook.addWorksheet('Hướng dẫn');
    for (const row of guideRowsOf(definition)) guide.addRow(row);
    guide.getRow(1).font = { bold: true };
    guide.columns = [28, 12, 40, 28, 28, 50, 36].map((width) => ({ width }));
    guide.addRow([]);
    for (const note of definition.notes) guide.addRow([note]);

    return Buffer.from(await workbook.xlsx.writeBuffer());
  }

  /** The title and the lines to fill in above the table of a form; returns the number of the row the headers will take. */
  private addFormHeading(
    sheet: ExcelJS.Worksheet,
    form: NonNullable<ImportTemplateDefinition['form']>,
    width: number,
  ): number {
    sheet.addRow([form.title]).font = { bold: true, size: 14 };
    sheet.mergeCells(1, 1, 1, width);
    for (const field of form.fields) sheet.addRow([field]).getCell(1).font = { bold: true };
    sheet.addRow([]);

    return sheet.rowCount + 1;
  }

  /** The cells of an example line: numbers for the number columns, the formula where the column has one. */
  private cellsOf(definition: ImportTemplateDefinition, row: readonly string[], rowNumber: number) {
    return definition.columns.map((column, index) => {
      const cell = row[index] ?? '';
      if (column.formula) {
        return { formula: column.formula.replaceAll('{row}', String(rowNumber)), result: Number(cell) };
      }

      return isNumber(column) ? Number(cell) : cell;
    });
  }

  private addTotal(sheet: ExcelJS.Worksheet, definition: ImportTemplateDefinition, first: number, last: number): void {
    const totals = definition.columns.map((column, index) => {
      if (index === 0) return definition.form?.totalLabel ?? '';
      if (column.kind !== 'vnd' || !column.formula) return null;
      const letter = sheet.getColumn(index + 1).letter;
      const result = definition.sampleRows.reduce((sum, row) => sum + Number(row[index] ?? 0), 0);

      return { formula: `SUM(${letter}${first}:${letter}${last})`, result };
    });
    const row = sheet.addRow(totals);
    row.font = { bold: true };
  }
}
