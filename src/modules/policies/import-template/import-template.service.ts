import { Injectable } from '@nestjs/common';
import ExcelJS from 'exceljs';
import type { ImportTemplateDefinition, ImportTemplateFormat, ImportTemplateKind } from '../public/policies.types';
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
    const data = workbook.addWorksheet('Dữ liệu');
    data.addRow(definition.columns.map((column) => column.key)).font = { bold: true };
    for (const row of definition.sampleRows) data.addRow(row);
    // The cells are text: a code that starts with zeros, a date or a long account number must reach the parser as it was written.
    data.columns = definition.columns.map((column) => ({
      key: column.key,
      width: Math.max(18, column.key.length + 4),
    }));
    data.eachRow((row) => row.eachCell((cell) => (cell.numFmt = '@')));
    const guide = workbook.addWorksheet('Hướng dẫn');
    for (const row of guideRowsOf(definition)) guide.addRow(row);
    guide.getRow(1).font = { bold: true };
    guide.columns = [28, 12, 40, 28, 28, 50, 36].map((width) => ({ width }));
    guide.addRow([]);
    for (const note of definition.notes) guide.addRow([note]);

    return Buffer.from(await workbook.xlsx.writeBuffer());
  }
}
