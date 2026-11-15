/** The roles an account can hold; the same set as `identity-access`, restated here because a policy names them as data. */
export const POLICY_ROLES = ['SUPER_ADMIN', 'IT_ADMIN', 'FINANCE', 'EMPLOYEE', 'MANAGER', 'SPENDING_APPROVER'] as const;

export type PolicyRole = (typeof POLICY_ROLES)[number];

/** The roles a policy may ask to acknowledge it: the Super Admin publishes the policies and never acknowledges one (`US-01-14` AC-5, Bộ chính sách khởi tạo, mục Đã chốt 7). */
export const POLICY_ACKNOWLEDGING_ROLES = ['IT_ADMIN', 'FINANCE', 'EMPLOYEE', 'MANAGER', 'SPENDING_APPROVER'] as const;

/** The files an IT Admin, a head, Finance or the Super Admin may ask a template of (`QĐ-111as`). There is no template of a bank statement. */
export const IMPORT_TEMPLATE_KINDS = [
  'employees',
  'seat-baseline',
  'license-keys',
  'usage-csv',
  'budget-proposal',
] as const;
export type ImportTemplateKind = (typeof IMPORT_TEMPLATE_KINDS)[number];

/** The formats a template can be made in; each definition says which of them its parser reads, the first being the default. */
export type ImportTemplateFormat = 'xlsx' | 'csv';

/** Who may download the template of each kind: the people who do that import (the head and Finance for the form `BM-10`). */
export const IMPORT_TEMPLATE_ROLES: Readonly<Record<ImportTemplateKind, readonly PolicyRole[]>> = {
  employees: ['SUPER_ADMIN'],
  'seat-baseline': ['IT_ADMIN'],
  'license-keys': ['IT_ADMIN'],
  'usage-csv': ['IT_ADMIN'],
  'budget-proposal': ['MANAGER', 'FINANCE'],
};

/** One column of a template, as the instruction sheet describes it. `key` is the header written in the file: the one the parser reads. */
export interface ImportTemplateColumn {
  key: string;
  description: string;
  required: boolean;
  /** How the value is written: a date as YYYY-MM-DD, an amount in VND with digits only. */
  format: string;
  example: string;
  /** What the parser refuses: a length, a list of values, a rule. */
  constraint: string;
  /** The codes the parser gives a row it refuses for this column, so the instruction sheet and the parser say the same. */
  refusedWith?: string[];
  /** How a person reads it in a form made for people; the header of the file otherwise, which for a file a parser reads is `key`. */
  label?: string;
  /** `integer` and `vnd` are numbers (formatted by the thousand); anything else is text, which a spreadsheet must not turn into a number or a date. */
  kind?: 'text' | 'integer' | 'vnd';
  /** The cell of an example line is this formula (`{row}` is the number of its row): the amount of a line is made of the cells beside it. */
  formula?: string;
}

/**
 * What the module that reads a kind of file says about it: the columns it reads and example rows that it reads back without a single error
 * (fictitious people, accounts and amounts, never real data). The library builds the file from this, so the template cannot drift from the parser.
 */
export interface ImportTemplateDefinition {
  kind: ImportTemplateKind;
  title: string;
  /** The formats the file is read in, the first the default: a template in a format the parser does not read would be refused whole. */
  formats: ImportTemplateFormat[];
  columns: ImportTemplateColumn[];
  /**
   * A form for people rather than a file for a parser (the budget form `BM-10`): a title, lines to fill in about who made it, headers in the reader's
   * words, and a total under the lines.
   */
  form?: { title: string; fields: string[]; totalLabel: string | null };
  /** Each row has one cell per column, in the order of `columns`. */
  sampleRows: string[][];
  /** Lines under the table of the instruction sheet: what the file may not contain, how many rows, who confirms. */
  notes: string[];
}
