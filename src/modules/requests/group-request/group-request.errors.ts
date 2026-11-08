import type { LineMismatch } from './group-line-decision.policy';
import type { PlanRefusal, RefusedLine } from './group-request.policy';

/** The plan of the request for a group does not take a group: by the kind of grant it makes, never by its name (`US-05-17` AC-14). */
export class GroupRequestPlanNotEligibleError extends Error {
  constructor(readonly reason: PlanRefusal) {
    super(`The plan does not take a request for a group: ${reason}.`);
    this.name = 'GroupRequestPlanNotEligibleError';
  }
}

/** More people were named than the sender may name (`US-05-17` AC-2, AC-13). */
export class GroupRequestTooManyLinesError extends Error {
  constructor(readonly max: number) {
    super(`A request for a group names at most ${max} people.`);
    this.name = 'GroupRequestTooManyLinesError';
  }
}

/** The term asked for is longer than the plan takes (`US-05-01` AC-4, `QĐ-98`). */
export class GroupRequestTermBeyondLimitError extends Error {
  constructor(readonly maxMonths: number) {
    super('The term is longer than a request for a group may ask for.');
    this.name = 'GroupRequestTermBeyondLimitError';
  }
}

/** Fewer different people were named than a request for a group needs, whoever sends it (`QĐ-100aa`, `S-01`). */
export class GroupRequestTooFewLinesError extends Error {
  constructor(readonly min: number) {
    super(`A request for a group names at least ${min} different people.`);
    this.name = 'GroupRequestTooFewLinesError';
  }
}

/** A person was named more than once. */
export class GroupRequestDuplicateLineError extends Error {
  constructor(readonly employeeIds: readonly string[]) {
    super('A person is named once in a request for a group.');
    this.name = 'GroupRequestDuplicateLineError';
  }
}

/** One or more of the people named cannot be in the request; every one is listed with its reason (`US-05-17` AC-2, AC-8, AC-12, AC-15). */
export class GroupRequestLinesRefusedError extends Error {
  constructor(readonly lines: readonly RefusedLine[]) {
    super('Some of the people named cannot be in the request.');
    this.name = 'GroupRequestLinesRefusedError';
  }
}

/** A decision on the lines of a step does not cover exactly the lines of the step (`US-05-17` AC-4). */
export class GroupRequestLinesMismatchError extends Error {
  constructor(readonly mismatch: LineMismatch) {
    super('The decision must name every line of the step, once.');
    this.name = 'GroupRequestLinesMismatchError';
  }
}

/** Approving a line of a person who has just been given the right: the line is checked again and the others are not touched (`AC-15`). */
export class GroupRequestLineHoldsAccessError extends Error {
  constructor(readonly employeeIds: readonly string[]) {
    super('A person of the lines already holds a seat of the plan.');
    this.name = 'GroupRequestLineHoldsAccessError';
  }
}

/** The request is not a request for a group, or the person is not one of its lines: the two answer alike. */
export class GroupRequestLineNotFoundError extends Error {
  constructor() {
    super('The request has no such line.');
    this.name = 'GroupRequestLineNotFoundError';
  }
}

/** The head cannot leave people out of the file as asked: nobody is left, or the line is not one that can be left out (`US-06-14` AC-13). */
export class GroupSupplementDropRefusedError extends Error {
  constructor(
    readonly reason: 'CANNOT_DROP_LAST_LINE' | 'LINE_NOT_DROPPABLE' | 'DROP_NOT_FOR_GROUP',
    readonly employeeIds: readonly string[] = [],
  ) {
    super(`The people cannot be left out of the file: ${reason}.`);
    this.name = 'GroupSupplementDropRefusedError';
  }
}
