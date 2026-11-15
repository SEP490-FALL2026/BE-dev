import type { BusinessDate } from '../../../core/business-date';
import { searchKey } from '../../../core/search-key';
import {
  ContractEffectiveFromRequiredError,
  ContractEffectiveRangeError,
  ContractIncompleteError,
  ContractReasonRequiredError,
  ContractSubscriptionKindNotAllowedError,
  ContractSubscriptionVendorMismatchError,
  ContractUpdateEmptyError,
  ContractVendorRequiredError,
} from './contract.errors';
import { cleanContractName } from './contract.policy';

/** What the days and the vendor of a contract say of it today (`US-04-13` AC-5, AC-12). */
export type ContractStatus = 'INCOMPLETE' | 'NOT_YET_EFFECTIVE' | 'ACTIVE' | 'EXPIRED';

/** The kinds of provisioning whose stock is shared by the company: the only subscriptions a contract rests on (`QĐ-111t`). */
const SHARED_STOCK_KINDS: ReadonlySet<string> = new Set(['K2', 'K4']);

export const MAX_CONTRACT_NUMBER_LENGTH = 100;
export const MAX_CONTRACT_NOTE_LENGTH = 2000;
export const MAX_CONTRACT_REASON_LENGTH = 1000;
/**
 * The most subscriptions, files and applications the detail of a contract lists; it says when there are more. The detail carries a
 * bounded slice of each, never the whole of an association that grows.
 */
export const CONTRACT_DETAIL_ARRAY_MAX = 100;

/** What a contract says of itself. There is no kind of contract: a purchase for good is a contract that never ends. */
export interface ContractFields {
  name: string;
  vendorId: string | null;
  number: string | null;
  effectiveFrom: BusinessDate | null;
  /** Empty: the contract never ends. */
  effectiveTo: BusinessDate | null;
  note: string | null;
}

/** What a change names: a field left out stays as it is; the number, the end and the note are cleared with null. */
export interface ContractChange {
  name?: string;
  vendorId?: string;
  number?: string | null;
  effectiveFrom?: BusinessDate;
  effectiveTo?: BusinessDate | null;
  note?: string | null;
}

export interface NewContract {
  name?: string;
  vendorId?: string;
  number?: string | null;
  effectiveFrom?: BusinessDate;
  effectiveTo?: BusinessDate | null;
  note?: string | null;
}

/**
 * The status of a contract on `today`, from its days alone. A contract without a vendor or without the day it begins is
 * incomplete (an old one that is only a name); one that has begun and has no end never expires.
 */
export function contractStatusOf(
  contract: Pick<ContractFields, 'vendorId' | 'effectiveFrom' | 'effectiveTo'>,
  today: BusinessDate,
): ContractStatus {
  if (contract.vendorId === null || contract.effectiveFrom === null) return 'INCOMPLETE';
  if (today < contract.effectiveFrom) return 'NOT_YET_EFFECTIVE';
  if (contract.effectiveTo !== null && today > contract.effectiveTo) return 'EXPIRED';

  return 'ACTIVE';
}

/** The number as numbers are compared: lower case, no accent, blanks collapsed. `HD-001` and ` hd-001 ` are one number. */
export function numberKeyOf(number: string): string {
  return searchKey(number);
}

/** The text trimmed, or null when it is blank: an empty box is no value. */
function trimmedOrNull(raw: string | null | undefined): string | null {
  const text = raw?.trim() ?? '';

  return text.length === 0 ? null : text;
}

/**
 * The number as it is kept, or null when there is none: a blank box, or text that is only combining marks (it has no key, which the database
 * refuses), is no number.
 */
function numberOrNull(raw: string | null | undefined): string | null {
  const text = trimmedOrNull(raw);

  return text === null || numberKeyOf(text) === '' ? null : text;
}

/** The days make a period: the end is not before the beginning, and an end needs a beginning. Throws ContractEffectiveRangeError. */
function assertRange(from: BusinessDate | null, to: BusinessDate | null): void {
  if (to === null) return;
  if (from === null) throw new ContractEffectiveRangeError('TO_WITHOUT_FROM');
  if (to < from) throw new ContractEffectiveRangeError('TO_BEFORE_FROM');
}

/**
 * The fields of a contract that is made now (`US-04-13` AC-1, AC-3, AC-5): a name, a vendor and the day it begins; the number,
 * the end and the note may be left out. Throws ContractNameRequiredError, ContractVendorRequiredError,
 * ContractEffectiveFromRequiredError and ContractEffectiveRangeError, in that order.
 */
export function newContractFields(input: NewContract): ContractFields {
  const name = cleanContractName(input.name ?? '');
  if (!input.vendorId) throw new ContractVendorRequiredError();
  if (!input.effectiveFrom) throw new ContractEffectiveFromRequiredError();
  const effectiveTo = input.effectiveTo ?? null;
  assertRange(input.effectiveFrom, effectiveTo);

  return {
    name,
    vendorId: input.vendorId,
    number: numberOrNull(input.number),
    effectiveFrom: input.effectiveFrom,
    effectiveTo,
    note: trimmedOrNull(input.note),
  };
}

/**
 * The fields a contract has after a change (`US-04-13` AC-5, AC-8): what is named replaces what was, what is left out stays. An
 * old contract that was only a name gets its vendor and days this way. Throws ContractUpdateEmptyError when nothing is named,
 * ContractNameRequiredError and ContractEffectiveRangeError.
 */
export function changedContractFields(current: ContractFields, change: ContractChange): ContractFields {
  if (Object.values(change).every((value) => value === undefined)) throw new ContractUpdateEmptyError();

  const next: ContractFields = {
    name: change.name === undefined ? current.name : cleanContractName(change.name),
    vendorId: change.vendorId ?? current.vendorId,
    number: change.number === undefined ? current.number : numberOrNull(change.number),
    effectiveFrom: change.effectiveFrom ?? current.effectiveFrom,
    effectiveTo: change.effectiveTo === undefined ? current.effectiveTo : change.effectiveTo,
    note: change.note === undefined ? current.note : trimmedOrNull(change.note),
  };
  assertRange(next.effectiveFrom, next.effectiveTo);

  return next;
}

/** Whether two sets of fields are the same, to the letter: a number written in another case is a change (its key is the same, its text is not). */
export function sameContractFields(a: ContractFields, b: ContractFields): boolean {
  return (
    a.name === b.name &&
    a.vendorId === b.vendorId &&
    a.number === b.number &&
    a.effectiveFrom === b.effectiveFrom &&
    a.effectiveTo === b.effectiveTo &&
    a.note === b.note
  );
}

/** The reason of a change, trimmed. Throws ContractReasonRequiredError when it is blank or missing. */
export function cleanChangeReason(raw: string | undefined): string {
  const reason = trimmedOrNull(raw);
  if (reason === null) throw new ContractReasonRequiredError();

  return reason;
}

/**
 * Whether a subscription may rest on a contract (`US-04-13` AC-6, AC-7; `QĐ-111t`): its plan gives out from a shared stock (K2 or K4),
 * the contract has a vendor, and the vendor of the subscription (that of its application) is the same. Throws
 * ContractSubscriptionKindNotAllowedError, ContractIncompleteError and ContractSubscriptionVendorMismatchError, in that order.
 */
export function assertSubscriptionLinkable(input: {
  provisioningType: string;
  subscriptionVendorId: string | null;
  contractVendorId: string | null;
}): void {
  if (!SHARED_STOCK_KINDS.has(input.provisioningType)) {
    throw new ContractSubscriptionKindNotAllowedError(input.provisioningType);
  }
  if (input.contractVendorId === null) throw new ContractIncompleteError();
  if (input.subscriptionVendorId !== input.contractVendorId) throw new ContractSubscriptionVendorMismatchError();
}
