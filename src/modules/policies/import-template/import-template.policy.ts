import {
  IMPORT_TEMPLATE_ROLES,
  type ImportTemplateDefinition,
  type ImportTemplateFormat,
  type ImportTemplateKind,
  type PolicyRole,
} from '../public/policies.types';

/** Tells a spreadsheet the file is UTF-8, so Vietnamese letters open as they were written. */
const BYTE_ORDER_MARK = '﻿';

const quoted = (cell: string): string => (/[",\r\n]/.test(cell) ? `"${cell.replaceAll('"', '""')}"` : cell);

const lineOf = (cells: readonly string[]): string => `${cells.map(quoted).join(',')}\r\n`;

/** The file of the kind as CSV: the byte order mark, the header the parser reads and the example rows, every line ended by CRLF. */
export function templateCsvOf(definition: ImportTemplateDefinition): string {
  return (
    BYTE_ORDER_MARK +
    lineOf(definition.columns.map((column) => column.key)) +
    definition.sampleRows.map(lineOf).join('')
  );
}

/** The table of the instruction sheet: one row per column, the first row names the fields. */
export function guideRowsOf(definition: ImportTemplateDefinition): string[][] {
  return [
    ['Cột', 'Bắt buộc', 'Mô tả', 'Định dạng', 'Ví dụ', 'Ràng buộc', 'Mã lỗi khi từ chối'],
    ...definition.columns.map((column) => [
      column.key,
      column.required ? 'Có' : 'Không',
      column.description,
      column.format,
      column.example,
      column.constraint,
      (column.refusedWith ?? []).join(', '),
    ]),
  ];
}

/** What is wrong with a definition a module gave: the file would not be what the parser reads. Empty when it is right. */
export function definitionProblems(definition: ImportTemplateDefinition): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const column of definition.columns) {
    if (seen.has(column.key)) problems.push(`column ${column.key} is written twice`);
    seen.add(column.key);
  }
  if (definition.formats.length === 0) problems.push('no format');
  if (definition.sampleRows.length === 0) problems.push('no example row');
  definition.sampleRows.forEach((row, index) => {
    if (row.length !== definition.columns.length) {
      problems.push(`row ${index + 1} has ${row.length} cells for ${definition.columns.length} columns`);
    }
  });

  return problems;
}

/** Whether a person holding these roles may download the template of the kind. */
export function canDownloadTemplate(kind: ImportTemplateKind, roles: readonly string[]): boolean {
  const allowed: readonly PolicyRole[] = IMPORT_TEMPLATE_ROLES[kind];

  return roles.some((role) => (allowed as readonly string[]).includes(role));
}

export function templateFileName(kind: ImportTemplateKind, format: ImportTemplateFormat): string {
  return `mau-${kind}.${format}`;
}
