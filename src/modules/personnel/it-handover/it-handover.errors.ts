/**
 * The hand-over of an IT Admin who leaves was refused (`IT_HANDOVER.<code>` on the wire, the status is the mapper's). The policy refuses
 * before anything is written; the facade of the catalog refuses a person who cannot take everything over.
 */
export type ItHandoverRefusal =
  'NOT_FOUND' | 'SOURCE_CANCELLED' | 'NOT_YET_YOURS' | 'NOTHING_TO_HAND_OVER' | 'SAME_PERSON' | 'TARGET_NOT_IT_ADMIN';

export class ItHandoverRefusedError extends Error {
  constructor(readonly code: ItHandoverRefusal) {
    super(`The hand-over of the IT Admin was refused (${code}).`);
    this.name = 'ItHandoverRefusedError';
  }
}
