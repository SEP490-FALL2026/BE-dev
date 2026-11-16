import type { NameKind } from '../../public/notifications.extension-points';
import { NAME_FALLBACK, NAME_KIND_BY_KEY, type NotificationLocale, type TextTemplate } from './notification-text.types';

/**
 * Pure renderer of the sentence templates (entry of the `notification-text` group). Syntax, from the catalogue:
 * `{key}` raw, `{key:name|date|enum|list|quarter|vnd}`, `[ optional group ]` (shown only when every variable in it
 * has a value, no nesting) and `{ by, cases, otherwise }` variants chosen by one param. Never throws: a missing
 * value prints nothing, a malformed value prints raw, a malformed bracket prints as the literal character.
 */

export const TEMPLATE_FORMATS = ['name', 'date', 'enum', 'list', 'quarter', 'vnd'] as const;
type TemplateFormat = (typeof TEMPLATE_FORMATS)[number];
const isFormat = (value: string): value is TemplateFormat => (TEMPLATE_FORMATS as readonly string[]).includes(value);

export interface RenderContext {
  params: Readonly<Record<string, unknown>>;
  locale: NotificationLocale;
  /** Display names found for this page, keyed by `nameLookupKey(kind, id)`. A missing id is simply absent. */
  names: ReadonlyMap<string, string>;
  /** Label of an enum value in `locale` for the notification being rendered; undefined when there is none. */
  labelOf: (key: string, value: string) => string | undefined;
  /** Kind of entity a key names; defaults to `NAME_KIND_BY_KEY`. */
  nameKindOf?: (key: string) => NameKind | undefined;
}

export interface TemplateVariable {
  key: string;
  format: string | undefined;
  /** True when the variable sits inside a `[ … ]` group. */
  optional: boolean;
}

export function nameLookupKey(kind: NameKind, id: string): string {
  return `${kind}:${id}`;
}

// ---------------------------------------------------------------------------------------------------------------
// Parsing

type VarNode = { t: 'var'; key: string; format: string | undefined };
type TextNode = { t: 'text'; text: string };
type GroupNode = { t: 'group'; nodes: (VarNode | TextNode)[] };
type Node = VarNode | TextNode | GroupNode;
interface Parsed {
  nodes: Node[];
  issues: string[];
}

const TOKEN = /\[|\]|\{([A-Za-z_]\w*)(?::([A-Za-z]+))?\}/g;
const parseCache = new Map<string, Parsed>();

function parse(source: string): Parsed {
  const cached = parseCache.get(source);
  if (cached) return cached;
  const nodes: Node[] = [];
  const issues: string[] = [];
  let group: (VarNode | TextNode)[] | null = null;
  const push = (node: VarNode | TextNode): void => {
    if (group) group.push(node);
    else nodes.push(node);
  };
  const text = (value: string): void => {
    if (value) push({ t: 'text', text: value });
  };
  let last = 0;
  for (const match of source.matchAll(TOKEN)) {
    text(source.slice(last, match.index));
    last = match.index + match[0].length;
    if (match[0] === '[') {
      if (group) {
        issues.push('nested "["');
        text('[');
      } else group = [];
    } else if (match[0] === ']') {
      if (group) {
        nodes.push({ t: 'group', nodes: group });
        group = null;
      } else {
        issues.push('stray "]"');
        text(']');
      }
    } else {
      const [, key, format] = match;
      if (format !== undefined && !isFormat(format)) issues.push(`unknown formatter ":${format}"`);
      push({ t: 'var', key, format });
    }
  }
  text(source.slice(last));
  if (group) {
    issues.push('unclosed "["');
    nodes.push({ t: 'text', text: '[' }, ...group);
  }
  issues.push(...braceIssues(nodes));
  const parsed = { nodes, issues };
  parseCache.set(source, parsed);
  return parsed;
}

/** A `{` or `}` left in plain text is a variable that did not parse (bad key, formatter or spacing). */
function braceIssues(nodes: readonly Node[]): string[] {
  const plain = nodes.flatMap((n) => (n.t === 'group' ? n.nodes : [n]));
  return plain
    .filter((n) => n.t === 'text' && /[{}]/.test(n.text))
    .map((n) => `literal brace in "${(n as TextNode).text.trim()}"`);
}

function branchesOf(template: TextTemplate): string[] {
  return typeof template === 'string' ? [template] : [...Object.values(template.cases), template.otherwise];
}

/** Variables of every branch of a template, in order (the `by` key of a variant is not listed). */
export function templateVariables(template: TextTemplate): TemplateVariable[] {
  return branchesOf(template).flatMap((branch) =>
    parse(branch).nodes.flatMap((node): TemplateVariable[] => {
      if (node.t === 'var') return [{ key: node.key, format: node.format, optional: false }];
      if (node.t === 'text') return [];
      return node.nodes.flatMap((n) => (n.t === 'var' ? [{ key: n.key, format: n.format, optional: true }] : []));
    }),
  );
}

/** Everything that would make a template render something other than its author meant; empty when well-formed. */
export function templateSyntaxIssues(template: TextTemplate): string[] {
  return branchesOf(template).flatMap((branch) => parse(branch).issues);
}

// ---------------------------------------------------------------------------------------------------------------
// Values

/** A param as text; undefined when it carries nothing printable (null, absent, NaN, an object). */
function rawOf(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : undefined;
  if (typeof value === 'boolean' || typeof value === 'bigint') return String(value);
  if (Array.isArray(value))
    return value
      .map(rawOf)
      .filter((v): v is string => v !== undefined)
      .join(',');
  return undefined;
}

const hasValue = (value: unknown): boolean => (rawOf(value) ?? '') !== '';

const MONTHS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

function formatDate(raw: string, locale: NotificationLocale): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (!m) return raw;
  const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (month < 1 || month > 12 || probe.getUTCMonth() !== month - 1 || probe.getUTCDate() !== day) return raw;
  return locale === 'vi' ? `${m[3]}/${m[2]}/${m[1]}` : `${m[3]} ${MONTHS_EN[month - 1]} ${m[1]}`;
}

function formatVnd(raw: string, locale: NotificationLocale): string {
  if (!/^-?\d+$/.test(raw)) return raw;
  const amount = BigInt(raw);
  const digits = (amount < 0n ? -amount : amount).toString();
  const separator = locale === 'vi' ? '.' : ',';
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, separator);
  const signed = amount < 0n ? `-${grouped}` : grouped;
  return locale === 'vi' ? `${signed} ₫` : `${signed} VND`;
}

function formatQuarter(raw: string, locale: NotificationLocale): string {
  if (!/^\d{1,2}$/.test(raw)) return raw;
  const month = Number(raw);
  if (month < 1 || month > 12) return raw;
  const quarter = Math.ceil(month / 3);
  return locale === 'vi' ? `quý ${quarter}` : `Q${quarter}`;
}

function formatName(key: string, id: string, ctx: RenderContext): string {
  const kind = (ctx.nameKindOf ?? ((k: string) => NAME_KIND_BY_KEY[k]))(key);
  // No kind means the key is not an id of a named thing: print nothing rather than leak the raw id.
  if (!kind) return '';
  return ctx.names.get(nameLookupKey(kind, id)) ?? NAME_FALLBACK[kind][ctx.locale];
}

function formatList(key: string, raw: string, ctx: RenderContext): string {
  return raw
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item !== '')
    .map((item) => ctx.labelOf(key, item) ?? item)
    .join(', ');
}

function formatValue(node: VarNode, ctx: RenderContext): string {
  const raw = rawOf(ctx.params[node.key]);
  if (raw === undefined || raw === '') return '';
  switch (node.format as TemplateFormat | undefined) {
    case 'name':
      return formatName(node.key, raw, ctx);
    case 'date':
      return formatDate(raw, ctx.locale);
    case 'vnd':
      return formatVnd(raw, ctx.locale);
    case 'quarter':
      return formatQuarter(raw, ctx.locale);
    case 'enum':
      return ctx.labelOf(node.key, raw) ?? raw;
    case 'list':
      return formatList(node.key, raw, ctx);
    default:
      return raw; // no formatter, or an unknown one
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Rendering

function branchOf(template: TextTemplate, params: Readonly<Record<string, unknown>>): string {
  if (typeof template === 'string') return template;
  const chosen = rawOf(params[template.by]);
  return chosen !== undefined && Object.hasOwn(template.cases, chosen) ? template.cases[chosen] : template.otherwise;
}

const groupShows = (group: GroupNode, params: Readonly<Record<string, unknown>>): boolean =>
  group.nodes.every((n) => n.t !== 'var' || hasValue(params[n.key]));

export function renderTemplate(template: TextTemplate, ctx: RenderContext): string {
  const part = (n: VarNode | TextNode): string => (n.t === 'text' ? n.text : formatValue(n, ctx));
  const out = parse(branchOf(template, ctx.params))
    .nodes.map((n) => (n.t === 'group' ? (groupShows(n, ctx.params) ? n.nodes.map(part).join('') : '') : part(n)))
    .join('');
  return out.replace(/ {2,}/g, ' ').trim();
}

/** The `{kind, id}` pairs the sentence will actually print names for (chosen branch, groups that show), each once. */
export function nameRefsOfTemplate(
  template: TextTemplate,
  params: Readonly<Record<string, unknown>>,
): { kind: NameKind; id: string }[] {
  const refs = new Map<string, { kind: NameKind; id: string }>();
  const visit = (n: VarNode | TextNode): void => {
    if (n.t !== 'var' || n.format !== 'name') return;
    const kind = NAME_KIND_BY_KEY[n.key];
    const id = rawOf(params[n.key]);
    if (kind && id) refs.set(nameLookupKey(kind, id), { kind, id });
  };
  for (const n of parse(branchOf(template, params)).nodes) {
    if (n.t !== 'group') visit(n);
    else if (groupShows(n, params)) n.nodes.forEach(visit);
  }
  return [...refs.values()];
}
