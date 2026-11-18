import ExcelJS from 'exceljs';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const directory = resolve('docs/examples/employee-import');
for (const name of ['employee-template', 'employees-15', 'employees-invalid']) {
  const csv = await readFile(resolve(directory, `${name}.csv`), 'utf8');
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'SaaS-Sentry';
  workbook.created = new Date('2026-01-01T00:00:00Z');
  workbook.modified = workbook.created;
  const sheet = workbook.addWorksheet('Employees');
  for (const line of csv.trimEnd().split(/\r?\n/)) sheet.addRow(line.split(','));
  await workbook.xlsx.writeFile(resolve(directory, `${name}.xlsx`));
}
