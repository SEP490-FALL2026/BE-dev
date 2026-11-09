import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  INITIAL_EXCEPTION_KEYS,
  INITIAL_NESTED_ARRAYS,
  NON_ENVELOPE_COLLECTIONS,
  type BusinessMaximum,
  type Classification,
  type CollectionException,
  type NestedArrayEntry,
  type NestedClassification,
  type RegistryEvent,
} from '../support/api-collection-registry';
import { COLLECTION_EXCEPTIONS } from '../support/api-collection-registry-exceptions';
import { REGISTRY_EVENTS_SINCE_INITIAL } from '../support/api-collection-registry-events';
import { NESTED_ARRAYS } from '../support/api-collection-registry-nested';

/**
 * API-LIST-DETAIL.1, LD-R2: inventory gate for every mounted collection (docs/rules/api-contract.md, section
 * "Collection và detail").
 *
 * Source: the committed openapi.json. It is generated from the mounted controllers, and the export test
 * (test/http/platform/openapi-export.http-spec.ts) and the CI export step fail when it differs by one byte from what the code
 * exports (GATE-01). Reading it here checks the mounted routes without booting Nest in a unit test.
 *
 * A GET is a collection when `data` is an array or carries an `items` array, or when it is listed exactly in
 * NON_ENVELOPE_COLLECTIONS. Every other array below `data`, at any depth and in any GET — in a collection item, in the
 * rest of the collection's `data`, in a detail, inside an object, a union, a map or the items of another array — is
 * found by a recursive walk and must have exactly one entry in NESTED_ARRAYS (LD-R2-RV-02): a proved maximum, the
 * finding that tracks it as unbounded, or its LD-13 Owner decision. So a list cannot hide under another property and a
 * new nested array cannot pass unseen. A larger bound is caught when the schema declares `maxItems`; a code constant the
 * schema does not show is caught only by the review condition of its entry. That registry also only shrinks
 * (INITIAL_NESTED_ARRAYS pins each key with its classification).
 *
 * Every collection either meets the rule (`pageSize` with a `maximum`; an item shape that is not the shape of a detail
 * operation) or has an exact entry in COLLECTION_EXCEPTIONS. Entries use the exact operationId (no suffix, prefix or
 * glob), name the work item that removes or reviews them and pin the item's property names, so an entry whose
 * operation changed shape is stale and fails. Entries are only ever removed: the initial set is written out in
 * INITIAL_EXCEPTION_KEYS (Prompt 09, 22/10/2026) and adding one needs a new Owner decision. An entry that claims a bound
 * records `maxItems`, a positive integer, and its source; the gate reads the number and never guesses from prose, and a
 * count per parent, per year or per group is not a bound (LD-15).
 *
 * Not visible here: queries. N+1 reads, in-memory paging, a count outside the page's snapshot and a missing `select`
 * are `query` entries; the owning item proves the fix with test/support/query-count.ts and then removes the entry.
 */

interface Schema {
  $ref?: string;
  type?: string;
  properties?: Record<string, Schema>;
  additionalProperties?: Schema | boolean;
  items?: Schema;
  anyOf?: Schema[];
  oneOf?: Schema[];
  allOf?: Schema[];
  maximum?: number;
  maxItems?: number;
}

interface Operation {
  operationId?: string;
  parameters?: { name: string; in: string; schema?: Schema }[];
  responses: Record<string, { content?: Record<string, { schema?: Schema }> }>;
}

interface OpenApi {
  paths: Record<string, Partial<Record<string, Operation>>>;
  components?: { schemas?: Record<string, Schema> };
}

interface Collection {
  itemProperties: string[];
  item: Schema;
  pageSizeMaximum: number | undefined;
  responseRef: string | undefined;
}

interface Resource {
  /** The property names of `data`, and of its only property when `data` wraps one object. */
  shapes: string[][];
  responseRef: string | undefined;
}

interface Registries {
  exceptions: readonly CollectionException[];
  nonEnvelope: Readonly<Record<string, string>>;
  nestedArrays: readonly NestedArrayEntry[];
  ownerExists: (owner: string) => boolean;
}

const CLASSIFICATIONS: readonly Classification[] = [
  'detail-reuse',
  'detail-projection',
  'unbounded',
  'bounded',
  'query',
  'owner-decision',
];
const NEEDS_MAXIMUM: readonly Classification[] = ['detail-reuse', 'bounded'];
const NESTED_CLASSIFICATIONS: readonly NestedClassification[] = ['bounded', 'unbounded', 'owner-decision'];
/** An exact operationId: no glob, suffix or prefix wildcard can match more than one operation. */
const EXACT_OPERATION_ID = /^[a-z][A-Za-z0-9]*$/;
/** `operationId#path` whose segments are property names (or `{}` for a map value), each optionally followed by `[]`. */
const NESTED_KEY =
  /^[a-z][A-Za-z0-9]*#(?:data\.)?(?:[A-Za-z_][A-Za-z0-9_]*|\{\})(?:\[\])*(?:\.(?:[A-Za-z_][A-Za-z0-9_]*|\{\})(?:\[\])*)*$/;
const FINDING = /^LD-\d+$/;
/**
 * A finding of the baseline remediation (`g0-g6-final-business-baseline-remediation`, F55, P03-D14 = A): the only thing it may
 * serve in this ledger is the removal of the entries of an operation that was removed, a `closed` event.
 */
const REMOVED_OPERATION_FINDING = /^(?:F\d+|QĐ-\d+[a-z]?)$/;
const WORK_ITEM_FOLDER = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const NEEDS_MAXIMUM_MESSAGE = 'needs a business maximum: maxItems as a positive integer item count, with its source';

function schemaTools(document: OpenApi) {
  const named = document.components?.schemas ?? {};
  const resolve = (schema: Schema | undefined): Schema | undefined => {
    let current = schema;
    for (let depth = 0; current?.$ref && depth < 20; depth += 1) current = named[current.$ref.split('/').pop() ?? ''];
    return current;
  };
  const variants = (schema: Schema | undefined): Schema[] => {
    const resolved = resolve(schema);
    if (!resolved) return [];
    const nested = [...(resolved.anyOf ?? []), ...(resolved.oneOf ?? []), ...(resolved.allOf ?? [])].flatMap(variants);
    return nested.length > 0 ? nested : [resolved];
  };
  const propertyNames = (schema: Schema | undefined): string[] =>
    [...new Set(variants(schema).flatMap((variant) => Object.keys(variant.properties ?? {})))].sort();
  const property = (schema: Schema | undefined, name: string): Schema | undefined =>
    variants(schema).find((variant) => variant.properties?.[name])?.properties?.[name];
  const isArray = (schema: Schema | undefined): boolean => variants(schema).some((variant) => variant.type === 'array');
  const arrayItem = (schema: Schema | undefined): Schema | undefined =>
    variants(schema).find((variant) => variant.type === 'array')?.items;

  return { resolve, propertyNames, property, isArray, arrayItem };
}

/**
 * Every array below the 200 `data` of every GET except a collection's own array, keyed `operationId#path` (the
 * NestedArrayEntry key), with the schema's `maxItems` when every variant of the array declares one. Unions are walked
 * variant by variant, maps through `{}`, array items through `[]`; a `$ref` already on the way down is not entered
 * again, so a cyclic schema ends. Collection detection is the one `evaluate` uses.
 */
function nestedArrayInventory(
  document: OpenApi,
  nonEnvelope: Readonly<Record<string, string>>,
): Map<string, number | undefined> {
  const tools = schemaTools(document);
  const named = document.components?.schemas ?? {};
  const found = new Map<string, { declared: boolean; maxItems: number }>();
  const below = (base: string, name: string) => (base === '' ? name : `${base}.${name}`);

  // `key` is the key of this value if it is an array; `base` prefixes the paths of its properties.
  const walk = (operationId: string, schema: Schema | undefined, key: string, base: string, refs: Set<string>) => {
    if (!schema) return;
    if (schema.$ref) {
      const name = schema.$ref.split('/').pop() ?? '';
      if (!refs.has(name)) walk(operationId, named[name], key, base, new Set([...refs, name]));
      return;
    }
    for (const part of [...(schema.anyOf ?? []), ...(schema.oneOf ?? []), ...(schema.allOf ?? [])])
      walk(operationId, part, key, base, refs);
    if (schema.type === 'array') {
      if (key !== '') {
        const full = `${operationId}#${key}`;
        const previous = found.get(full);
        found.set(full, {
          declared: schema.maxItems !== undefined && (previous?.declared ?? true),
          maxItems: Math.max(previous?.maxItems ?? 0, schema.maxItems ?? 0),
        });
      }
      walk(operationId, schema.items, `${key}[]`, key, refs);
      return;
    }
    for (const [name, child] of Object.entries(schema.properties ?? {}))
      walk(operationId, child, below(base, name), below(base, name), refs);
    if (typeof schema.additionalProperties === 'object')
      walk(operationId, schema.additionalProperties, below(base, '{}'), below(base, '{}'), refs);
  };

  for (const item of Object.values(document.paths)) {
    const id = item.get?.operationId;
    if (!id) continue;
    const data = tools.property(item.get?.responses['200']?.content?.['application/json']?.schema, 'data');
    const topName = nonEnvelope[id] ?? 'items';
    const top = tools.isArray(data) ? data : tools.property(data, topName);
    if (!tools.isArray(top)) {
      walk(id, data, '', '', new Set());
      continue;
    }
    walk(id, tools.arrayItem(top), '[]', '', new Set());
    if (top !== data)
      for (const name of tools.propertyNames(data))
        if (name !== topName) walk(id, tools.property(data, name), `data.${name}`, `data.${name}`, new Set());
  }

  return new Map([...found].map(([key, { declared, maxItems }]) => [key, declared ? maxItems : undefined]));
}

const exceptionKey = (exception: CollectionException) => `${exception.operationId}#${exception.classification}`;

/** INITIAL_EXCEPTION_KEYS and INITIAL_NESTED_ARRAYS with every ledger event applied: what the live registries hold. */
function registriesAfter(events: readonly RegistryEvent[]) {
  const exceptionKeys = new Set(INITIAL_EXCEPTION_KEYS);
  const nested = new Map<string, NestedClassification>(Object.entries(INITIAL_NESTED_ARRAYS));
  for (const event of events)
    if (event.registry === 'exceptions') {
      if (event.change === 'closed') exceptionKeys.delete(event.key);
      if (event.change === 'added') exceptionKeys.add(event.key);
    } else if (event.change === 'closed') nested.delete(event.key);
    else if (event.to !== undefined) nested.set(event.key, event.to);

  return { exceptionKeys, nested };
}

/**
 * The entries outside INITIAL_NESTED_ARRAYS with the ledger applied: a new key, or a key whose classification changed,
 * without its event; each needs the Owner.
 */
function nestedEntriesOutsideInitialSet(
  entries: readonly NestedArrayEntry[],
  events: readonly RegistryEvent[] = REGISTRY_EVENTS_SINCE_INITIAL,
): string[] {
  const { nested } = registriesAfter(events);
  return entries
    .filter((entry) => nested.get(entry.key) !== entry.classification)
    .map((entry) => `${entry.key} (${entry.classification})`);
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The frozen initial registries against the live ones (P28-07): every difference has exactly one ledger event, and every
 * event matches a real difference (its key and classifications before and after). A difference without an event is a
 * silent rewrite; an event without its difference is a stale or invented record.
 */
function ledgerProblems(
  live: { exceptions: readonly CollectionException[]; nestedArrays: readonly NestedArrayEntry[] },
  events: readonly RegistryEvent[],
  ownerExists: (owner: string) => boolean,
): string[] {
  const problems: string[] = [];
  const liveKeys = new Set(live.exceptions.map(exceptionKey));
  const liveNested = new Map(live.nestedArrays.map((entry) => [entry.key, entry]));
  const evented = new Set<string>();

  for (const event of events) {
    const label = `ledger ${event.registry} ${event.change} ${event.key}`;
    if (evented.has(`${event.registry} ${event.key}`)) problems.push(`${label}: a second event for the key`);
    evented.add(`${event.registry} ${event.key}`);
    problems.push(...eventHygiene(event, label, ownerExists));
    problems.push(
      ...(event.registry === 'exceptions'
        ? exceptionEventProblems(event, label, liveKeys)
        : nestedEventProblems(event, label, liveNested)),
    );
  }

  for (const key of INITIAL_EXCEPTION_KEYS)
    if (!evented.has(`exceptions ${key}`) && !liveKeys.has(key))
      problems.push(
        `${key}: in INITIAL_EXCEPTION_KEYS but not in COLLECTION_EXCEPTIONS, and no ledger event closes it (silent removal)`,
      );
  for (const key of liveKeys)
    if (!evented.has(`exceptions ${key}`) && !INITIAL_EXCEPTION_KEYS.includes(key))
      problems.push(
        `${key}: in COLLECTION_EXCEPTIONS but not in INITIAL_EXCEPTION_KEYS, and no ledger event adds it (silent rewrite)`,
      );
  for (const [key, before] of Object.entries(INITIAL_NESTED_ARRAYS)) {
    const after = liveNested.get(key)?.classification;
    if (evented.has(`nested ${key}`)) continue;
    if (after === undefined)
      problems.push(
        `${key}: in INITIAL_NESTED_ARRAYS but not in NESTED_ARRAYS, and no ledger event closes it (silent removal)`,
      );
    else if (after !== before)
      problems.push(
        `${key}: ${before} in INITIAL_NESTED_ARRAYS but ${after} in NESTED_ARRAYS, and no ledger event reclassifies it (silent rewrite)`,
      );
  }
  for (const [key, entry] of liveNested)
    if (!evented.has(`nested ${key}`) && !Object.hasOwn(INITIAL_NESTED_ARRAYS, key))
      problems.push(
        `${key} (${entry.classification}): in NESTED_ARRAYS but not in INITIAL_NESTED_ARRAYS, and no ledger event adds it (silent rewrite)`,
      );

  return problems;
}

function eventHygiene(event: RegistryEvent, label: string, ownerExists: (owner: string) => boolean): string[] {
  const problems: string[] = [];
  const removal = event.change === 'closed' && REMOVED_OPERATION_FINDING.test(event.finding);
  if (!FINDING.test(event.finding) && !removal)
    problems.push(`${label}: finding '${event.finding}' is not one exact LD-<n>`);
  if (!WORK_ITEM_FOLDER.test(event.item) || !ownerExists(event.item))
    problems.push(`${label}: item '${event.item}' is not a work item under docs/workspace/items`);
  if (!ISO_DATE.test(event.date) || Number.isNaN(Date.parse(event.date)))
    problems.push(`${label}: date '${event.date}' is not a YYYY-MM-DD day`);
  if (event.reason.trim() === '') problems.push(`${label}: needs a reason`);

  return problems;
}

const OWNER_DECISION_OPEN = 'an owner-decision entry closes or changes only with the Owner decision that settles it';

function exceptionEventProblems(event: RegistryEvent, label: string, liveKeys: ReadonlySet<string>): string[] {
  const problems: string[] = [];
  const initial = INITIAL_EXCEPTION_KEYS.includes(event.key);
  const live = liveKeys.has(event.key);
  const decided = (event.ownerDecision ?? '').trim() !== '';
  if (
    event.change === 'reclassified' ||
    event.from !== undefined ||
    event.to !== undefined ||
    event.bound !== undefined
  )
    problems.push(
      `${label}: an exception key carries its classification; record one closed and one added event, without from, to or bound`,
    );
  if (event.change === 'closed') {
    if (!initial) problems.push(`${label}: INITIAL_EXCEPTION_KEYS has no such key, so there is nothing to close`);
    if (live) problems.push(`${label}: the key is still in COLLECTION_EXCEPTIONS, so nothing was closed`);
    if (event.key.endsWith('#owner-decision') && !decided) problems.push(`${label}: ${OWNER_DECISION_OPEN} (LD-13)`);
  }
  if (event.change === 'added') {
    if (initial) problems.push(`${label}: the key is already in INITIAL_EXCEPTION_KEYS, so nothing was added`);
    if (!live) problems.push(`${label}: COLLECTION_EXCEPTIONS has no such key, so nothing was added`);
    if (!decided) problems.push(`${label}: adding an exception needs the Owner decision that allows it`);
  }

  return problems;
}

function nestedEventProblems(
  event: RegistryEvent,
  label: string,
  liveNested: ReadonlyMap<string, NestedArrayEntry>,
): string[] {
  const problems: string[] = [];
  const before = Object.hasOwn(INITIAL_NESTED_ARRAYS, event.key) ? INITIAL_NESTED_ARRAYS[event.key] : undefined;
  const after = liveNested.get(event.key);
  const decided = (event.ownerDecision ?? '').trim() !== '';
  const fromMatches = () => {
    if (before === undefined) problems.push(`${label}: INITIAL_NESTED_ARRAYS has no such key`);
    else if (event.from !== before)
      problems.push(`${label}: from '${event.from ?? 'none'}' but INITIAL_NESTED_ARRAYS holds '${before}'`);
  };
  const toMatches = () => {
    if (after === undefined) problems.push(`${label}: NESTED_ARRAYS has no such key`);
    else if (event.to !== after.classification)
      problems.push(`${label}: to '${event.to ?? 'none'}' but NESTED_ARRAYS holds '${after.classification}'`);
  };

  if (event.change === 'closed') {
    fromMatches();
    if (after !== undefined) problems.push(`${label}: the key is still in NESTED_ARRAYS, so nothing was closed`);
    if (event.to !== undefined) problems.push(`${label}: a closed event has no to`);
  }
  if (event.change === 'added') {
    if (before !== undefined)
      problems.push(`${label}: the key is already in INITIAL_NESTED_ARRAYS, so nothing was added`);
    if (event.from !== undefined) problems.push(`${label}: an added event has no from`);
    toMatches();
  }
  if (event.change === 'reclassified') {
    fromMatches();
    toMatches();
    if (event.from === event.to) problems.push(`${label}: from and to are the same, so nothing was reclassified`);
  }
  if (before === 'owner-decision' && !decided) problems.push(`${label}: ${OWNER_DECISION_OPEN} (LD-13)`);
  if (event.change !== 'closed' && event.to === 'bounded') {
    if (!event.bound?.trim())
      problems.push(`${label}: a bounded event names the constant or validation that proves the maximum (bound)`);
    else if (after !== undefined && !(after.businessMaximum?.source ?? '').includes(event.bound))
      problems.push(`${label}: the NESTED_ARRAYS source of the key does not name its bound '${event.bound}'`);
  }
  if (event.change !== 'closed' && event.to !== 'bounded' && !decided)
    problems.push(`${label}: a nested key becomes ${event.to ?? 'none'} only with the Owner decision that allows it`);

  return problems;
}

/** Classifies every GET of the document and returns everything the rule finds wrong, one sentence each. */
function evaluate(document: OpenApi, registries: Registries): string[] {
  const tools = schemaTools(document);
  const problems: string[] = [];
  const collections = new Map<string, Collection>();
  const resources = new Map<string, Resource>();

  for (const [path, item] of Object.entries(document.paths)) {
    const operation = item.get;
    if (!operation) continue;
    const id = operation.operationId;
    if (!id) {
      problems.push(`GET ${path} has no operationId`);
      continue;
    }
    const schema = operation.responses['200']?.content?.['application/json']?.schema;
    const responseRef = schema?.$ref;
    const data = tools.property(schema, 'data');
    const pageSize = operation.parameters?.find(
      (parameter) => parameter.in === 'query' && parameter.name === 'pageSize',
    );
    const pageSizeMaximum = tools.resolve(pageSize?.schema)?.maximum;
    const nonEnvelope = registries.nonEnvelope[id];
    const array = tools.isArray(data) ? data : (tools.property(data, nonEnvelope ?? 'items') ?? undefined);

    if (nonEnvelope !== undefined && !tools.isArray(tools.property(data, nonEnvelope))) {
      problems.push(`${id}: NON_ENVELOPE_COLLECTIONS names '${nonEnvelope}', which is not an array of its data`);
      continue;
    }
    if (tools.isArray(array)) {
      const element = tools.arrayItem(array) ?? {};
      collections.set(id, {
        item: element,
        itemProperties: tools.propertyNames(element),
        pageSizeMaximum,
        responseRef,
      });
      continue;
    }
    const top = tools.propertyNames(data);
    const shapes = [top];
    if (top.length === 1 && !tools.isArray(tools.property(data, top[0])))
      shapes.push(tools.propertyNames(tools.property(data, top[0])));
    resources.set(id, { shapes, responseRef });
  }

  for (const id of Object.keys(registries.nonEnvelope))
    if (!collections.has(id)) problems.push(`${id}: NON_ENVELOPE_COLLECTIONS entry is not a GET collection (stale)`);

  const keys = new Set<string>();
  for (const entry of registries.exceptions) {
    const key = `${entry.operationId}#${entry.classification}`;
    if (keys.has(key)) problems.push(`${key}: duplicate exception`);
    keys.add(key);
    problems.push(...hygiene(entry, registries.ownerExists));
    if (EXACT_OPERATION_ID.test(entry.operationId) && !collections.has(entry.operationId))
      problems.push(`${key}: no GET collection has this operationId (stale entry)`);
  }

  const detailResponseRefs = new Set([...resources.values()].map((resource) => resource.responseRef));
  for (const [id, collection] of collections) {
    const entries = registries.exceptions.filter((entry) => entry.operationId === id);
    const has = (classification: Classification) => entries.find((entry) => entry.classification === classification);
    const unpaged = has('bounded') ?? has('unbounded');

    if (collection.pageSizeMaximum === undefined && !unpaged)
      problems.push(`${id}: collection without a pageSize maximum and no bounded or unbounded exception`);
    if (collection.pageSizeMaximum !== undefined && unpaged)
      problems.push(`${id}#${unpaged.classification}: the collection is paginated now (stale entry)`);

    const sameShape = [...resources]
      .filter(([, resource]) => resource.shapes.some((shape) => shape.join() === collection.itemProperties.join()))
      .map(([detail]) => detail);
    const reuse = has('detail-reuse');
    if (sameShape.length > 0 && !(reuse && sameShape.includes(reuse.detailOperationId ?? '')))
      problems.push(`${id}: the item has the shape of ${sameShape.join(', ')} and no detail-reuse exception names it`);
    if (reuse && !sameShape.includes(reuse.detailOperationId ?? ''))
      problems.push(`${id}#detail-reuse: the item no longer has the shape of ${reuse.detailOperationId} (stale entry)`);
    // A page of the detail resource holds at most pageSize.maximum items: the recorded number must be that one.
    if (
      reuse &&
      isItemCountMaximum(reuse.businessMaximum) &&
      reuse.businessMaximum.maxItems !== collection.pageSizeMaximum
    )
      problems.push(
        `${id}#detail-reuse: records maxItems ${reuse.businessMaximum.maxItems} but pageSize.maximum is ` +
          `${collection.pageSizeMaximum ?? 'not declared'} (stale entry)`,
      );

    const projection = has('detail-projection');
    const missing = (projection?.projectedFields ?? []).filter((field) => !collection.itemProperties.includes(field));
    if (missing.length > 0)
      problems.push(`${id}#detail-projection: the item no longer carries ${missing.join(', ')} (stale entry)`);

    for (const entry of entries)
      if (entry.itemProperties.join() !== collection.itemProperties.join())
        problems.push(
          `${id}#${entry.classification}: the item is now [${collection.itemProperties.join(', ')}]; ` +
            'remove the entry if its finding is fixed, or have its owner review it',
        );
    if (collection.responseRef && detailResponseRefs.has(collection.responseRef))
      problems.push(`${id}: shares its response schema ${collection.responseRef} with a detail operation`);
  }

  problems.push(...nestedProblems(nestedArrayInventory(document, registries.nonEnvelope), registries));

  return problems;
}

function hygiene(entry: CollectionException, ownerExists: (owner: string) => boolean): string[] {
  const key = `${entry.operationId}#${entry.classification}`;
  const problems: string[] = [];
  if (!EXACT_OPERATION_ID.test(entry.operationId))
    problems.push(`${key}: operationId must be one exact operationId, not a pattern`);
  if (!CLASSIFICATIONS.includes(entry.classification)) problems.push(`${key}: unknown classification`);
  if (!WORK_ITEM_FOLDER.test(entry.owner) || !ownerExists(entry.owner))
    problems.push(`${key}: owner '${entry.owner}' is not a work item under docs/workspace/items`);
  if (entry.rationale.trim() === '' || entry.removeWhen.trim() === '')
    problems.push(`${key}: needs a rationale and a removal or review condition`);
  if (entry.itemProperties.length === 0 || entry.itemProperties.join() !== [...entry.itemProperties].sort().join())
    problems.push(`${key}: itemProperties must list the item's property names, sorted`);
  if (NEEDS_MAXIMUM.includes(entry.classification) && !isItemCountMaximum(entry.businessMaximum))
    problems.push(`${key}: ${NEEDS_MAXIMUM_MESSAGE}`);
  if (entry.classification === 'detail-reuse' && !entry.detailOperationId)
    problems.push(`${key}: needs the detail operation it reuses`);
  if (entry.classification === 'detail-projection' && !entry.projectedFields?.length)
    problems.push(`${key}: needs the detail-only fields it projects`);

  return problems;
}

/**
 * NESTED_ARRAYS against the recursive inventory: every array has exactly one entry, every entry still names an array,
 * and a recorded maximum equals the schema's `maxItems` when the schema has one.
 */
function nestedProblems(inventory: Map<string, number | undefined>, registries: Registries): string[] {
  const problems: string[] = [];
  const recorded = new Set<string>();
  for (const entry of registries.nestedArrays) {
    if (recorded.has(entry.key)) problems.push(`${entry.key}: duplicate nested-array entry`);
    recorded.add(entry.key);
    problems.push(...nestedHygiene(entry, registries.ownerExists));
    if (!NESTED_KEY.test(entry.key)) continue;
    if (!inventory.has(entry.key)) {
      problems.push(`${entry.key}: NESTED_ARRAYS entry matches no array of the mounted contract (stale entry)`);
      continue;
    }
    const declared = inventory.get(entry.key);
    if (
      entry.classification === 'bounded' &&
      declared !== undefined &&
      isItemCountMaximum(entry.businessMaximum) &&
      entry.businessMaximum.maxItems !== declared
    )
      problems.push(
        `${entry.key}: records maxItems ${entry.businessMaximum.maxItems} but the schema says maxItems ${declared} (stale entry)`,
      );
  }
  for (const key of [...inventory.keys()].sort())
    if (!recorded.has(key))
      problems.push(
        `${key}: array not in NESTED_ARRAYS — record its maximum, its finding or its Owner decision, or page it`,
      );

  return problems;
}

function nestedHygiene(entry: NestedArrayEntry, ownerExists: (owner: string) => boolean): string[] {
  const { key, classification } = entry;
  const problems: string[] = [];
  if (!NESTED_KEY.test(key))
    problems.push(`${key}: key must be one operationId#path with exact segments, not a pattern`);
  if (!NESTED_CLASSIFICATIONS.includes(classification)) problems.push(`${key}: unknown classification`);
  if (!WORK_ITEM_FOLDER.test(entry.owner) || !ownerExists(entry.owner))
    problems.push(`${key}: owner '${entry.owner}' is not a work item under docs/workspace/items`);
  if (entry.rationale.trim() === '' || entry.removeWhen.trim() === '')
    problems.push(`${key}: needs a rationale and a removal or review condition`);
  if (classification === 'bounded' && !isItemCountMaximum(entry.businessMaximum))
    problems.push(`${key}: ${NEEDS_MAXIMUM_MESSAGE}`);
  if (classification !== 'bounded' && entry.businessMaximum !== undefined)
    problems.push(`${key}: an ${classification} entry records no business maximum`);
  if (classification !== 'bounded' && !entry.findings.some((finding) => FINDING.test(finding)))
    problems.push(`${key}: an ${classification} entry needs the exact finding that tracks it`);
  if (classification === 'owner-decision' && !entry.findings.includes('LD-13'))
    problems.push(`${key}: an owner-decision entry names its LD-13 point`);

  return problems;
}

/** A recorded number, not prose: zero, negative, fractional, non-finite or text values and a blank source fail. */
function isItemCountMaximum(maximum: BusinessMaximum | undefined): maximum is BusinessMaximum {
  return (
    Number.isSafeInteger(maximum?.maxItems) &&
    (maximum?.maxItems ?? 0) > 0 &&
    typeof maximum?.source === 'string' &&
    maximum.source.trim() !== ''
  );
}

const repositoryRoot = process.cwd();
const realRegistries: Registries = {
  exceptions: COLLECTION_EXCEPTIONS,
  nonEnvelope: NON_ENVELOPE_COLLECTIONS,
  nestedArrays: NESTED_ARRAYS,
  ownerExists: (owner) => existsSync(join(repositoryRoot, 'docs', 'workspace', 'items', owner, 'spec.md')),
};

/**
 * The exception keys a registry holds outside INITIAL_EXCEPTION_KEYS with the ledger applied; each one needs a new Owner
 * decision.
 */
function keysOutsideInitialSet(
  exceptions: readonly CollectionException[],
  events: readonly RegistryEvent[] = REGISTRY_EVENTS_SINCE_INITIAL,
): string[] {
  const { exceptionKeys } = registriesAfter(events);
  return exceptions.map(exceptionKey).filter((key) => !exceptionKeys.has(key));
}

const liveRegistries = { exceptions: COLLECTION_EXCEPTIONS, nestedArrays: NESTED_ARRAYS };

/**
 * A minimal OpenAPI document: `collections` answer `{ data: { items: [...], ...wrapper } }`, `details` answer `{ data }`.
 * Item properties are strings, except the schemas given in `properties`; `schemas` become components for `$ref`.
 */
function fixture(options: {
  collections?: Record<
    string,
    { item: string[]; pageSizeMaximum?: number; properties?: Record<string, Schema>; wrapper?: Record<string, Schema> }
  >;
  details?: Record<string, Record<string, Schema>>;
  schemas?: Record<string, Schema>;
}): OpenApi {
  const object = (names: string[], properties: Record<string, Schema> = {}): Schema => ({
    type: 'object',
    properties: { ...Object.fromEntries(names.map((name) => [name, { type: 'string' }])), ...properties },
  });
  const envelope = (data: Schema) => ({
    responses: {
      '200': { content: { 'application/json': { schema: { type: 'object', properties: { data } } } } },
    },
  });
  const paths: OpenApi['paths'] = {};
  for (const [id, { item, pageSizeMaximum, properties, wrapper }] of Object.entries(options.collections ?? {}))
    paths[`/${id}`] = {
      get: {
        operationId: id,
        parameters:
          pageSizeMaximum === undefined
            ? []
            : [{ name: 'pageSize', in: 'query', schema: { type: 'integer', maximum: pageSizeMaximum } }],
        ...envelope({
          type: 'object',
          properties: { items: { type: 'array', items: object(item, properties) }, ...wrapper },
        }),
      },
    };
  for (const [id, properties] of Object.entries(options.details ?? {}))
    paths[`/${id}/{id}`] = { get: { operationId: id, ...envelope({ type: 'object', properties }) } };

  return { paths, components: { schemas: options.schemas ?? {} } };
}

const noRegistries = (overrides: Partial<Registries> = {}): Registries => ({
  exceptions: [],
  nonEnvelope: {},
  nestedArrays: [],
  ownerExists: (owner) => owner === 'an-owning-item',
  ...overrides,
});

const nestedEntry = (key: string, overrides: Partial<NestedArrayEntry> = {}): NestedArrayEntry => ({
  key,
  classification: 'bounded',
  findings: [],
  owner: 'an-owning-item',
  rationale: 'Why the array is bounded.',
  removeWhen: 'Review when its source changes.',
  businessMaximum: { maxItems: 20, source: 'a code constant' },
  ...overrides,
});

const unregistered = (key: string) =>
  `${key}: array not in NESTED_ARRAYS — record its maximum, its finding or its Owner decision, or page it`;

// Registry data as an author could write it, so the casts in the tests below are the point of the tests.
const INVALID_MAXIMA: Record<string, object> = {
  zero: { maxItems: 0, source: 'a code constant' },
  negative: { maxItems: -1, source: 'a code constant' },
  fractional: { maxItems: 1.5, source: 'a code constant' },
  'not a number': { maxItems: Number.NaN, source: 'a code constant' },
  infinite: { maxItems: Number.POSITIVE_INFINITY, source: 'a code constant' },
  text: { maxItems: '20', source: 'a code constant' },
  missing: { source: 'a code constant' },
  'prose only': { limit: '20 per parent', source: 'a code constant' },
  'no source': { maxItems: 20, source: ' ' },
};

/** The arrays review LD-R2-RV-02 named; the recursive inventory must find every one the ledger has not closed. */
const REVIEW_NAMED_ARRAYS = [
  'standardToolsetList#plans',
  'applicationList#domains',
  'vendorGroupList#serviceLines',
  'departmentGet#projects.departments',
  'employeeImportGet#summary.reviewQueue.items',
  'vendorGroupList#serviceLines.domains',
  'subscriptionList#alerts.dates',
  'applicationRetirementGet#retirement.blockers.assignments',
  'onboardingChecklistGet#steps.reasons',
];

const entry = (overrides: Partial<CollectionException>): CollectionException => ({
  operationId: 'thingList',
  classification: 'query',
  findings: ['LD-00'],
  owner: 'an-owning-item',
  rationale: 'Why the entry exists.',
  removeWhen: 'When it can go.',
  itemProperties: ['id', 'name'],
  ...overrides,
});

// API-LIST-DETAIL.1, LD-R2
describe('collection and detail contract gate', () => {
  const document = JSON.parse(readFileSync(join(repositoryRoot, 'openapi.json'), 'utf8')) as OpenApi;

  it('finds every mounted collection compliant or recorded by an exact, current exception', () => {
    expect(evaluate(document, realRegistries)).toEqual([]);
  });

  it('only ever shrinks the exception registry recorded on 22/10/2026, except through a documented ledger event', () => {
    expect(keysOutsideInitialSet(COLLECTION_EXCEPTIONS)).toEqual([]);
  });

  it('differs from the frozen initial registries exactly by the ledger events (no silent rewrite, no idle event)', () => {
    expect(ledgerProblems(liveRegistries, REGISTRY_EVENTS_SINCE_INITIAL, realRegistries.ownerExists)).toEqual([]);
  });

  // P28-07
  it('keeps the frozen initial registries of Prompt 09/09B unedited', () => {
    const fingerprint = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

    // The values of 19be620. A changed fingerprint is a rewrite of the baseline: record a ledger event instead.
    expect(INITIAL_EXCEPTION_KEYS).toHaveLength(34);
    expect(fingerprint(INITIAL_EXCEPTION_KEYS)).toBe(
      '2dcd604ad3b1b3f0ca153d2dd634543321c39eff1ffa4c580bacd662f699de43',
    );
    expect(Object.keys(INITIAL_NESTED_ARRAYS)).toHaveLength(67);
    expect(fingerprint(Object.entries(INITIAL_NESTED_ARRAYS))).toBe(
      'e811c8edaad29ef97db5fa202924721fd12ea3a7ddb96abbe82ac2e1a4a542fb',
    );
  });

  // LD-15
  it('has no exception left for the department warnings and the non-working dates: they are pages', () => {
    const keys = COLLECTION_EXCEPTIONS.map(exceptionKey);

    expect(COLLECTION_EXCEPTIONS.filter((exception) => exception.findings.includes('LD-15'))).toEqual([]);
    for (const operationId of ['departmentWarningList', 'nonWorkingDateList']) {
      expect(keys.filter((key) => key.startsWith(`${operationId}#`))).toEqual([]);
    }
    expect(
      REGISTRY_EVENTS_SINCE_INITIAL.filter((event) => event.finding === 'LD-15').map((event) => event.key),
    ).toEqual(['departmentWarningList#unbounded', 'nonWorkingDateList#unbounded']);
  });

  // LD-13
  it('keeps the operations of the Owner decisions on the list contracts recorded, so no contract is chosen by this gate', () => {
    const decisions = COLLECTION_EXCEPTIONS.filter((exception) => exception.findings.includes('LD-13'));

    expect(decisions.map((exception) => exception.operationId).sort()).toEqual([
      'auditEventList',
      'departmentList',
      'licenseAssignmentList',
      'provisioningTaskList',
      'subscriptionList',
      'vendorGroupList',
      'vendorProposalList',
      'vendorSuggestionList',
    ]);
    // LD-13 is open: no ledger event may close or change one of its entries.
    expect(
      REGISTRY_EVENTS_SINCE_INITIAL.filter(
        (event) =>
          event.finding === 'LD-13' || event.key.endsWith('#owner-decision') || event.from === 'owner-decision',
      ),
    ).toEqual([]);
  });

  // LD-R2-RV-02
  it('discovers every nested array the review named, however deep, unless the ledger closed it', () => {
    const inventory = nestedArrayInventory(document, NON_ENVELOPE_COLLECTIONS);
    const closed = REGISTRY_EVENTS_SINCE_INITIAL.filter(
      (event) => event.registry === 'nested' && event.change === 'closed',
    ).map((event) => event.key);

    expect(REVIEW_NAMED_ARRAYS.filter((key) => !inventory.has(key))).toEqual(
      REVIEW_NAMED_ARRAYS.filter((key) => closed.includes(key)),
    );
    expect(REVIEW_NAMED_ARRAYS.filter((key) => closed.includes(key))).toEqual([
      'standardToolsetList#plans',
      'applicationList#domains',
      'departmentGet#projects.departments',
    ]);
  });

  it('only ever shrinks the nested-array inventory recorded on 23/10/2026, classification included, except through the ledger', () => {
    const reclassified = NESTED_ARRAYS.map((entry) =>
      entry.key === 'onboardingChecklistGet#steps.warnings'
        ? { ...entry, classification: 'bounded' as const, businessMaximum: { maxItems: 20, source: 'a guess' } }
        : entry,
    );

    expect(Object.keys(INITIAL_NESTED_ARRAYS)).toEqual(expect.arrayContaining(REVIEW_NAMED_ARRAYS));
    expect(nestedEntriesOutsideInitialSet(NESTED_ARRAYS)).toEqual([]);
    expect(nestedEntriesOutsideInitialSet([...NESTED_ARRAYS, nestedEntry('jobTitleList#aliases')])).toEqual([
      'jobTitleList#aliases (bounded)',
    ]);
    expect(nestedEntriesOutsideInitialSet(reclassified)).toEqual(['onboardingChecklistGet#steps.warnings (bounded)']);
  });

  // LD-16
  it('records the nested arrays no earlier finding covers, each with an existing owner; the plan one is bounded since 23/10/2026', () => {
    const subcases = NESTED_ARRAYS.filter((entry) => entry.findings.includes('LD-16'));

    expect(subcases.map((entry) => `${entry.key} -> ${entry.owner}`).sort()).toEqual([
      'onboardingChecklistGet#steps.warnings -> api-list-detail-contract-remediation',
      'planTermsGet#warnings -> catalog-subscription-read-model',
    ]);
    expect(subcases.map((entry) => `${entry.key} ${entry.classification}`).sort()).toEqual([
      'onboardingChecklistGet#steps.warnings unbounded',
      'planTermsGet#warnings bounded',
    ]);
  });

  // P28-07
  describe('registry ledger: the frozen registries change only through documented events', () => {
    const check = (
      live: Partial<typeof liveRegistries> = {},
      events: readonly RegistryEvent[] = REGISTRY_EVENTS_SINCE_INITIAL,
    ) => ledgerProblems({ ...liveRegistries, ...live }, events, realRegistries.ownerExists);
    const withoutException = (key: string) =>
      COLLECTION_EXCEPTIONS.filter((exception) => exceptionKey(exception) !== key);
    const eventOf = (key: string): RegistryEvent => {
      const found = REGISTRY_EVENTS_SINCE_INITIAL.find((event) => event.key === key);
      if (!found) throw new Error(`no ledger event for ${key}`);
      return found;
    };
    const replaced = (key: string, overrides: Partial<RegistryEvent>) =>
      REGISTRY_EVENTS_SINCE_INITIAL.map((event) => (event.key === key ? { ...event, ...overrides } : event));

    it('refuses a silent removal of an exception or a nested array', () => {
      expect(
        check({
          exceptions: withoutException('provisioningTaskList#owner-decision'),
          nestedArrays: NESTED_ARRAYS.filter((entry) => entry.key !== 'healthGetReadiness#checks'),
        }),
      ).toEqual([
        'provisioningTaskList#owner-decision: in INITIAL_EXCEPTION_KEYS but not in COLLECTION_EXCEPTIONS, and no ledger event closes it (silent removal)',
        'healthGetReadiness#checks: in INITIAL_NESTED_ARRAYS but not in NESTED_ARRAYS, and no ledger event closes it (silent removal)',
      ]);
    });

    it('refuses a silent addition and a silent reclassification', () => {
      const reclassified = NESTED_ARRAYS.map((entry) =>
        entry.key === 'onboardingChecklistGet#steps.warnings'
          ? { ...entry, classification: 'bounded' as const, businessMaximum: { maxItems: 20, source: 'a guess' } }
          : entry,
      );

      expect(
        check({
          exceptions: [...COLLECTION_EXCEPTIONS, entry({ operationId: 'thingList', classification: 'unbounded' })],
          nestedArrays: [...reclassified, nestedEntry('jobTitleList#aliases')],
        }),
      ).toEqual([
        'thingList#unbounded: in COLLECTION_EXCEPTIONS but not in INITIAL_EXCEPTION_KEYS, and no ledger event adds it (silent rewrite)',
        'onboardingChecklistGet#steps.warnings: unbounded in INITIAL_NESTED_ARRAYS but bounded in NESTED_ARRAYS, and no ledger event reclassifies it (silent rewrite)',
        'jobTitleList#aliases (bounded): in NESTED_ARRAYS but not in INITIAL_NESTED_ARRAYS, and no ledger event adds it (silent rewrite)',
      ]);
    });

    it('refuses an event that matches no real difference', () => {
      const idle: RegistryEvent[] = [
        { ...eventOf('licenseKeyList#query'), key: 'currencyList#bounded' },
        { ...eventOf('licenseKeyList#query'), key: 'thingList#query' },
        { ...eventOf('provisioningTaskList#steps'), key: 'healthGetReadiness#checks' },
        {
          ...eventOf('applicationRetirementGet#retirement.blockers.assignmentsByPlan'),
          key: 'auditEventList#actorRoles',
          bound: 'authorizingRoles',
        },
      ];

      expect(check({}, [...REGISTRY_EVENTS_SINCE_INITIAL, ...idle])).toEqual([
        'ledger exceptions closed currencyList#bounded: the key is still in COLLECTION_EXCEPTIONS, so nothing was closed',
        'ledger exceptions closed thingList#query: INITIAL_EXCEPTION_KEYS has no such key, so there is nothing to close',
        'ledger nested closed healthGetReadiness#checks: the key is still in NESTED_ARRAYS, so nothing was closed',
        'ledger nested added auditEventList#actorRoles: the key is already in INITIAL_NESTED_ARRAYS, so nothing was added',
      ]);
      expect(check({}, replaced('applicationGet#similarApplications', { from: 'owner-decision' }))).toEqual([
        "ledger nested reclassified applicationGet#similarApplications: from 'owner-decision' but INITIAL_NESTED_ARRAYS holds 'unbounded'",
      ]);
      expect(check({}, replaced('planTermsGet#opinions', { to: 'unbounded' }))).toEqual([
        "ledger nested reclassified planTermsGet#opinions: to 'unbounded' but NESTED_ARRAYS holds 'bounded'",
        'ledger nested reclassified planTermsGet#opinions: from and to are the same, so nothing was reclassified',
        'ledger nested reclassified planTermsGet#opinions: a nested key becomes unbounded only with the Owner decision that allows it',
      ]);
    });

    // LD-13
    it('refuses closing an owner-decision entry without the Owner decision that settles it', () => {
      const key = 'provisioningTaskList#owner-decision';
      const closing: RegistryEvent = { ...eventOf('licenseKeyList#query'), key, finding: 'LD-13' };
      const live = { exceptions: withoutException(key) };

      expect(check(live, [...REGISTRY_EVENTS_SINCE_INITIAL, closing])).toEqual([
        `ledger exceptions closed ${key}: ${OWNER_DECISION_OPEN} (LD-13)`,
      ]);
      expect(check(live, [...REGISTRY_EVENTS_SINCE_INITIAL, { ...closing, ownerDecision: 'QĐ-xx point 5' }])).toEqual(
        [],
      );
    });

    it('refuses a bounded event whose live source does not name its bound, and an exception added without the Owner', () => {
      const added: RegistryEvent = { ...eventOf('licenseKeyList#query'), key: 'thingList#unbounded', change: 'added' };
      const live = {
        exceptions: [...COLLECTION_EXCEPTIONS, entry({ operationId: 'thingList', classification: 'unbounded' })],
      };

      expect(check({}, replaced('applicationGet#similarApplications', { bound: 'A_GUESS' }))).toEqual([
        "ledger nested reclassified applicationGet#similarApplications: the NESTED_ARRAYS source of the key does not name its bound 'A_GUESS'",
      ]);
      expect(check({}, replaced('applicationGet#similarApplications', { bound: undefined }))).toEqual([
        'ledger nested reclassified applicationGet#similarApplications: a bounded event names the constant or validation that proves the maximum (bound)',
      ]);
      expect(check(live, [...REGISTRY_EVENTS_SINCE_INITIAL, added])).toEqual([
        'ledger exceptions added thingList#unbounded: adding an exception needs the Owner decision that allows it',
      ]);
    });

    it('refuses a malformed event and a second event for one key', () => {
      const event = eventOf('licenseKeyList#query');
      const malformed = {
        ...event,
        finding: 'LD-x',
        item: 'nobody',
        date: 'yesterday' as string as RegistryEvent['date'],
        reason: ' ',
      };

      expect(check({}, replaced('licenseKeyList#query', malformed))).toEqual([
        "ledger exceptions closed licenseKeyList#query: finding 'LD-x' is not one exact LD-<n>",
        "ledger exceptions closed licenseKeyList#query: item 'nobody' is not a work item under docs/workspace/items",
        "ledger exceptions closed licenseKeyList#query: date 'yesterday' is not a YYYY-MM-DD day",
        'ledger exceptions closed licenseKeyList#query: needs a reason',
      ]);
      expect(check({}, [...REGISTRY_EVENTS_SINCE_INITIAL, event])).toEqual([
        'ledger exceptions closed licenseKeyList#query: a second event for the key',
      ]);
    });
  });

  describe('on fixture documents (each case is one way the rule is broken)', () => {
    const compliant = fixture({
      collections: { thingList: { item: ['id', 'name'], pageSizeMaximum: 100 } },
      details: { thingGet: { id: { type: 'string' }, name: { type: 'string' }, notes: { type: 'string' } } },
    });

    it('accepts a paginated summary whose detail extends it', () => {
      expect(evaluate(compliant, noRegistries())).toEqual([]);
    });

    it('refuses an unregistered collection without a pageSize maximum', () => {
      const document = fixture({ collections: { thingList: { item: ['id', 'name'] } } });

      expect(evaluate(document, noRegistries())).toEqual([
        'thingList: collection without a pageSize maximum and no bounded or unbounded exception',
      ]);
    });

    it('refuses a collection that reuses the detail schema without an exact bounded exception', () => {
      const document = fixture({
        collections: { thingList: { item: ['id', 'name', 'notes'], pageSizeMaximum: 100 } },
        details: { thingGet: { id: { type: 'string' }, name: { type: 'string' }, notes: { type: 'string' } } },
      });
      const unbounded = entry({
        classification: 'detail-reuse',
        detailOperationId: 'thingGet',
        itemProperties: ['id', 'name', 'notes'],
      });

      expect(evaluate(document, noRegistries())).toEqual([
        'thingList: the item has the shape of thingGet and no detail-reuse exception names it',
      ]);
      expect(evaluate(document, noRegistries({ exceptions: [unbounded] }))).toEqual([
        'thingList#detail-reuse: needs a business maximum: maxItems as a positive integer item count, with its source',
      ]);
      const bounded = { ...unbounded, businessMaximum: { maxItems: 100, source: 'pageSize maximum' } };
      expect(evaluate(document, noRegistries({ exceptions: [bounded] }))).toEqual([]);
    });

    it('refuses a bounded or detail-reuse entry whose maximum is not a positive integer item count', () => {
      const cases: [Classification, OpenApi, CollectionException, number][] = [
        [
          'bounded',
          fixture({ collections: { thingList: { item: ['id', 'name'] } } }),
          entry({ classification: 'bounded' }),
          20,
        ],
        [
          'detail-reuse',
          fixture({
            collections: { thingList: { item: ['id', 'name', 'notes'], pageSizeMaximum: 100 } },
            details: { thingGet: { id: { type: 'string' }, name: { type: 'string' }, notes: { type: 'string' } } },
          }),
          entry({
            classification: 'detail-reuse',
            detailOperationId: 'thingGet',
            itemProperties: ['id', 'name', 'notes'],
          }),
          100,
        ],
      ];

      for (const [classification, document, base, maxItems] of cases) {
        const withMaximum = (maximum: object) =>
          evaluate(document, noRegistries({ exceptions: [{ ...base, businessMaximum: maximum as BusinessMaximum }] }));
        const refused = [`thingList#${classification}: ${NEEDS_MAXIMUM_MESSAGE}`];

        for (const [name, maximum] of Object.entries(INVALID_MAXIMA))
          expect({ classification, name, problems: withMaximum(maximum) }).toEqual({
            classification,
            name,
            problems: refused,
          });
        expect({ classification, problems: withMaximum({ maxItems, source: 'a code constant' }) }).toEqual({
          classification,
          problems: [],
        });
      }
    });

    it('refuses a detail-reuse maxItems that differs from the real pageSize maximum, naming both', () => {
      const document = fixture({
        collections: { thingList: { item: ['id', 'name', 'notes'], pageSizeMaximum: 100 } },
        details: { thingGet: { id: { type: 'string' }, name: { type: 'string' }, notes: { type: 'string' } } },
      });
      const reuse = (maxItems: number) =>
        entry({
          classification: 'detail-reuse',
          detailOperationId: 'thingGet',
          itemProperties: ['id', 'name', 'notes'],
          businessMaximum: { maxItems, source: 'pageSize maximum of the operation' },
        });

      expect(evaluate(document, noRegistries({ exceptions: [reuse(50)] }))).toEqual([
        'thingList#detail-reuse: records maxItems 50 but pageSize.maximum is 100 (stale entry)',
      ]);
      expect(evaluate(document, noRegistries({ exceptions: [reuse(100)] }))).toEqual([]);
    });

    it('refuses a detail reuse hidden behind the detail wrapper property', () => {
      const document = fixture({
        collections: { thingList: { item: ['id', 'name'], pageSizeMaximum: 100 } },
        details: {
          thingGet: { thing: { type: 'object', properties: { id: { type: 'string' }, name: { type: 'string' } } } },
        },
      });

      expect(evaluate(document, noRegistries())).toEqual([
        'thingList: the item has the shape of thingGet and no detail-reuse exception names it',
      ]);
    });

    it('refuses a stale exception: the operation was fixed, changed shape or no longer exists', () => {
      const fixedPaging = entry({ classification: 'unbounded' });
      const changedShape = entry({ classification: 'query', itemProperties: ['id', 'name', 'removedField'] });
      const gone = entry({ operationId: 'removedList' });

      expect(evaluate(compliant, noRegistries({ exceptions: [fixedPaging, changedShape, gone] }))).toEqual([
        'removedList#query: no GET collection has this operationId (stale entry)',
        'thingList#unbounded: the collection is paginated now (stale entry)',
        'thingList#query: the item is now [id, name]; remove the entry if its finding is fixed, or have its owner review it',
      ]);
    });

    it('refuses a glob, suffix or prefix instead of one exact operationId', () => {
      const patterns = ['*List', 'thing*', 'thing.*', 'catalog/thingList'].map((operationId) => entry({ operationId }));

      expect(evaluate(compliant, noRegistries({ exceptions: patterns }))).toEqual(
        patterns.map(
          (pattern) => `${pattern.operationId}#query: operationId must be one exact operationId, not a pattern`,
        ),
      );
    });

    it('refuses an exception without an owning work item, a rationale or a removal condition', () => {
      const incomplete = entry({ owner: 'nobody', rationale: ' ', removeWhen: '' });

      expect(evaluate(compliant, noRegistries({ exceptions: [incomplete] }))).toEqual([
        "thingList#query: owner 'nobody' is not a work item under docs/workspace/items",
        'thingList#query: needs a rationale and a removal or review condition',
      ]);
    });

    it('refuses a list hidden under another property of a detail-like answer', () => {
      const document = fixture({
        details: { thingSearch: { results: { type: 'array', items: { type: 'object' } } } },
      });

      expect(evaluate(document, noRegistries())).toEqual([unregistered('thingSearch#results')]);
      expect(evaluate(document, noRegistries({ nestedArrays: [nestedEntry('thingSearch#results')] }))).toEqual([]);
    });
  });

  // LD-R2-RV-02
  describe('nested arrays on fixture documents: every array below data, at any depth', () => {
    const lines: Schema = { type: 'array', items: { type: 'object', properties: { code: { type: 'string' } } } };

    it('refuses an unregistered array in a collection item', () => {
      const document = fixture({
        collections: {
          thingList: { item: ['id'], pageSizeMaximum: 100, properties: { tags: { type: 'array', items: {} } } },
        },
      });

      expect(evaluate(document, noRegistries())).toEqual([unregistered('thingList#tags')]);
      expect(evaluate(document, noRegistries({ nestedArrays: [nestedEntry('thingList#tags')] }))).toEqual([]);
    });

    it('refuses an unregistered array next to the collection array, in its data wrapper', () => {
      const document = fixture({
        collections: { thingList: { item: ['id'], pageSizeMaximum: 100, wrapper: { summary: lines } } },
      });

      expect(evaluate(document, noRegistries())).toEqual([unregistered('thingList#data.summary')]);
    });

    it('refuses an unregistered array two object levels inside a detail', () => {
      const document = fixture({
        details: {
          thingGet: {
            summary: { type: 'object', properties: { queue: { type: 'object', properties: { entries: lines } } } },
          },
        },
      });

      expect(evaluate(document, noRegistries())).toEqual([unregistered('thingGet#summary.queue.entries')]);
      expect(
        evaluate(document, noRegistries({ nestedArrays: [nestedEntry('thingGet#summary.queue.entries')] })),
      ).toEqual([]);
    });

    it('refuses an unregistered array inside the items of another array', () => {
      const document = fixture({
        details: {
          thingGet: {
            lines: { type: 'array', items: { type: 'object', properties: { codes: { type: 'array', items: {} } } } },
            grid: { type: 'array', items: { type: 'array', items: { type: 'number' } } },
          },
        },
      });
      const registered = [nestedEntry('thingGet#lines'), nestedEntry('thingGet#grid')];

      expect(evaluate(document, noRegistries({ nestedArrays: registered }))).toEqual([
        unregistered('thingGet#grid[]'),
        unregistered('thingGet#lines.codes'),
      ]);
    });

    it('walks unions, maps and cyclic $ref graphs, recording each array once', () => {
      const document = fixture({
        schemas: {
          Node: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              children: { type: 'array', items: { $ref: '#/components/schemas/Node' } },
            },
          },
        },
        details: {
          treeGet: {
            root: { $ref: '#/components/schemas/Node' },
            value: { anyOf: [{ type: 'number' }, { type: 'array', items: { type: 'number' } }] },
            byCode: { type: 'object', additionalProperties: lines },
          },
        },
      });

      expect(evaluate(document, noRegistries())).toEqual([
        unregistered('treeGet#byCode.{}'),
        unregistered('treeGet#root.children'),
        unregistered('treeGet#value'),
      ]);
    });

    it('refuses a nested-array entry the mounted contract no longer has', () => {
      const document = fixture({ details: { thingGet: { lines } } });

      expect(
        evaluate(
          document,
          noRegistries({ nestedArrays: [nestedEntry('thingGet#lines'), nestedEntry('thingGet#gone')] }),
        ),
      ).toEqual(['thingGet#gone: NESTED_ARRAYS entry matches no array of the mounted contract (stale entry)']);
    });

    it('refuses a nested bound whose maximum is not a positive integer item count, or whose source is blank', () => {
      const document = fixture({ details: { thingGet: { lines } } });
      const withMaximum = (maximum: object) =>
        evaluate(
          document,
          noRegistries({
            nestedArrays: [nestedEntry('thingGet#lines', { businessMaximum: maximum as BusinessMaximum })],
          }),
        );

      for (const [name, maximum] of Object.entries(INVALID_MAXIMA))
        expect({ name, problems: withMaximum(maximum) }).toEqual({
          name,
          problems: [`thingGet#lines: ${NEEDS_MAXIMUM_MESSAGE}`],
        });
      expect(withMaximum({ maxItems: 20, source: 'a code constant' })).toEqual([]);
    });

    it('refuses a recorded maximum that differs from the maxItems of the schema', () => {
      const document = fixture({ details: { thingGet: { lines: { ...lines, maxItems: 5 } } } });
      const recorded = (maxItems: number) =>
        nestedEntry('thingGet#lines', { businessMaximum: { maxItems, source: 'maxItems of the schema' } });

      expect(evaluate(document, noRegistries({ nestedArrays: [recorded(10)] }))).toEqual([
        'thingGet#lines: records maxItems 10 but the schema says maxItems 5 (stale entry)',
      ]);
      expect(evaluate(document, noRegistries({ nestedArrays: [recorded(5)] }))).toEqual([]);
    });

    it('refuses a pattern key, a missing owner or reason, an unbounded entry without its finding or with a maximum', () => {
      const document = fixture({ details: { thingGet: { lines } } });
      const check = (entries: NestedArrayEntry[]) => evaluate(document, noRegistries({ nestedArrays: entries }));
      const valid = nestedEntry('thingGet#lines');

      expect(
        check([
          valid,
          ...['thingGet#*', 'thing*#lines', 'thingGet#lines.*', 'thingGet'].map((key) => nestedEntry(key)),
        ]),
      ).toEqual(
        ['thingGet#*', 'thing*#lines', 'thingGet#lines.*', 'thingGet'].map(
          (key) => `${key}: key must be one operationId#path with exact segments, not a pattern`,
        ),
      );
      expect(check([{ ...valid, owner: 'nobody', rationale: ' ', removeWhen: '' }])).toEqual([
        "thingGet#lines: owner 'nobody' is not a work item under docs/workspace/items",
        'thingGet#lines: needs a rationale and a removal or review condition',
      ]);
      const unbounded = nestedEntry('thingGet#lines', { classification: 'unbounded', businessMaximum: undefined });
      expect(check([{ ...unbounded, findings: [] }])).toEqual([
        'thingGet#lines: an unbounded entry needs the exact finding that tracks it',
      ]);
      expect(check([{ ...unbounded, findings: ['LD-06'], businessMaximum: { maxItems: 20, source: 'x' } }])).toEqual([
        'thingGet#lines: an unbounded entry records no business maximum',
      ]);
      expect(check([{ ...unbounded, classification: 'owner-decision', findings: ['LD-06'] }])).toEqual([
        'thingGet#lines: an owner-decision entry names its LD-13 point',
      ]);
    });
  });
});
